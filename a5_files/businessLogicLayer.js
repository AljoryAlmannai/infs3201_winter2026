const persistence = require('./persistence')
const email = require('./emailSystem')
const crypto = require('crypto')

/**
 * Retrieves all employees in the system.
 * @returns {Promise<Array>} Array of employee documents.
 */
async function listAllEmployees() {
    return await persistence.loadEmployeesData()
}

/**
 * Retrieves a single employee by their ID.
 * @param {string} empid - Hex string of the MongoDB ObjectId.
 * @returns {Promise<Object|null>} The employee document, or null if not found.
 */
async function getEmployee(empid) {
    return await persistence.findEmployeeById(empid)
}

/**
 * Retrieves the schedule for a specific employee, sorted by date and start time.
 * @param {string} empid - Hex string of the MongoDB ObjectId.
 * @returns {Promise<Array>} Sorted array of shift documents.
 */
async function viewEmployeeSchedule(empid) {
    const shifts = await persistence.loadShiftsForEmployee(empid)

    // Bubble sort by date + startTime (no .sort() callback allowed)
    for (let i = 0; i < shifts.length - 1; i++) {
        for (let j = i + 1; j < shifts.length; j++) {
            const dateA = shifts[i].date + ' ' + shifts[i].startTime
            const dateB = shifts[j].date + ' ' + shifts[j].startTime
            if (dateA > dateB) {
                const temp = shifts[i]
                shifts[i] = shifts[j]
                shifts[j] = temp
            }
        }
    }

    return shifts
}

/**
 * Adds a new employee to the system if they don't already exist.
 * @param {string} name - Employee name.
 * @param {string} phone - Employee phone number.
 * @returns {Promise<boolean>} True if added, false if duplicate.
 */
async function addEmployee(name, phone) {
    const employeeList = await persistence.loadEmployeesData()

    for (let e of employeeList) {
        if (e.name === name && e.phone === phone) {
            return false
        }
    }
    await persistence.saveEmployee({ name, phone })
    return true
}

/**
 * Updates an existing employee's name and phone number.
 * @param {string} employeeId - Hex string of the MongoDB ObjectId.
 * @param {string} name - New name.
 * @param {string} phone - New phone number.
 * @returns {Promise<void>}
 */
async function updateEmployee(employeeId, name, phone) {
    await persistence.updateEmployee(employeeId, name, phone)
}

/**
 * Validates employee form data. Trims inputs and checks constraints.
 * @param {string} name - Raw name input.
 * @param {string} phone - Raw phone input.
 * @returns {{ valid: boolean, name: string, phone: string, error: string|null }}
 */
function validateEmployeeForm(name, phone) {
    const trimmedName = (name || '').trim()
    const trimmedPhone = (phone || '').trim()

    if (!trimmedName) {
        return { valid: false, name: trimmedName, phone: trimmedPhone, error: 'Name must not be empty.' }
    }

    const phonePattern = /^\d{4}-\d{4}$/
    if (!phonePattern.test(trimmedPhone)) {
        return { valid: false, name: trimmedName, phone: trimmedPhone, error: 'Phone number must be in the format XXXX-XXXX.' }
    }

    return { valid: true, name: trimmedName, phone: trimmedPhone, error: null }
}

/**
 * Computes the duration of a shift in hours.
 * @param {string} startTime - Start time in HH:MM format.
 * @param {string} endTime - End time in HH:MM format.
 * @returns {number} Duration in hours.
 */
function computeShiftDuration(startTime, endTime) {
    const startHour = Number(startTime.substring(0, 2))
    const endHour = Number(endTime.substring(0, 2))
    return endHour - startHour
}

/**
 * Hashes a plain-text password using SHA-256.
 * @param {string} password - The plain-text password.
 * @returns {string} The hex-encoded SHA-256 hash.
 */
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex')
}

// ─── Authentication ──────────────────────────────────────────────────────────

/**
 * Validates login credentials against the users collection.
 * Handles account locking and failed attempt tracking.
 * Returns a result object indicating success or the reason for failure.
 * @param {string} username - Submitted username.
 * @param {string} password - Submitted plain-text password.
 * @returns {Promise<{ success: boolean, user: Object|null, locked: boolean, invalid: boolean }>}
 */
async function validateLogin(username, password) {
    const user = await persistence.findUserByUsername(username)

    if (!user) {
        return { success: false, user: null, locked: false, invalid: true }
    }

    // Account already locked
    if (user.locked) {
        return { success: false, user: null, locked: true, invalid: false }
    }

    const hashed = hashPassword(password)
    if (user.passwordHash !== hashed) {
        // Increment failed attempts
        const attempts = await persistence.incrementFailedLogins(username)

        // At 3 attempts — send suspicious activity warning
        if (attempts === 3) {
            if (user.email) {
                await email.sendSuspiciousActivityWarning(user.email, username)
            }
        }

        // At 10 attempts — lock the account
        if (attempts >= 10) {
            await persistence.lockAccount(username)
            if (user.email) {
                await email.sendAccountLockedNotification(user.email, username)
            }
            return { success: false, user: null, locked: true, invalid: false }
        }

        return { success: false, user: null, locked: false, invalid: true }
    }

    // Successful password check — reset failed counter
    await persistence.resetFailedLogins(username)
    return { success: true, user, locked: false, invalid: false }
}

// ─── 2FA ────────────────────────────────────────────────────────────────────

const TWO_FA_EXPIRY_MS = 3 * 60 * 1000 // 3 minutes

/**
 * Generates a random 6-digit 2FA code, stores it, and emails it to the user.
 * @param {string} username - The username to generate a code for.
 * @param {string} userEmail - The email address to send the code to.
 * @returns {Promise<void>}
 */
async function generateAndSend2FACode(username, userEmail) {
    // Generate 6-digit code — pad with leading zeros if needed
    const codeNumber = crypto.randomInt(0, 1000000)
    const code = String(codeNumber).padStart(6, '0')
    const expiresAt = new Date(Date.now() + TWO_FA_EXPIRY_MS)

    await persistence.saveTwoFactorCode(username, code, expiresAt)
    await email.send2FACode(userEmail, code)
}

/**
 * Verifies the 2FA code submitted by the user.
 * @param {string} username - The username attempting verification.
 * @param {string} submittedCode - The code entered by the user.
 * @returns {Promise<boolean>} True if the code is correct and not expired, false otherwise.
 */
async function verify2FACode(username, submittedCode) {
    const record = await persistence.findTwoFactorCode(username)

    if (!record) {
        return false
    }

    if (record.code !== submittedCode.trim()) {
        return false
    }

    // Code is correct — delete it so it can't be reused
    await persistence.deleteTwoFactorCode(username)
    return true
}

// ─── Session ─────────────────────────────────────────────────────────────────

const SESSION_DURATION_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Generates a random session ID using cryptographically secure random bytes.
 * @returns {string} A 64-character hex session ID.
 */
function generateSessionId() {
    return crypto.randomBytes(32).toString('hex')
}

/**
 * Creates a new session for the given user and returns the session ID.
 * @param {string} username - The username to create a session for.
 * @returns {Promise<string>} The new session ID.
 */
async function createSession(username) {
    const sessionId = generateSessionId()
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
    await persistence.createSession(sessionId, username, expiresAt)
    return sessionId
}

/**
 * Looks up a session and extends its expiry if valid.
 * @param {string} sessionId - The session ID to look up.
 * @returns {Promise<Object|null>} The session document, or null if invalid/expired.
 */
async function getAndExtendSession(sessionId) {
    const session = await persistence.findSession(sessionId)
    if (!session) {
        return null
    }
    const newExpiry = new Date(Date.now() + SESSION_DURATION_MS)
    await persistence.extendSession(sessionId, newExpiry)
    return session
}

/**
 * Deletes a session from the database.
 * @param {string} sessionId - The session ID to remove.
 * @returns {Promise<void>}
 */
async function discardSession(sessionId) {
    await persistence.deleteSession(sessionId)
}

/**
 * Records a security log entry.
 * @param {string|null} username - The logged-in username, or null if unauthenticated.
 * @param {string} url - The requested URL.
 * @param {string} method - The HTTP method.
 * @returns {Promise<void>}
 */
async function logAccess(username, url, method) {
    await persistence.logSecurityEvent({
        timestamp: new Date(),
        username: username || null,
        url,
        method
    })
}

// ─── Employee Documents ──────────────────────────────────────────────────────

const MAX_DOCUMENTS = 5
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB

/**
 * Checks whether an employee has room for another document upload.
 * @param {string} employeeId - Hex string of the employee's ObjectId.
 * @returns {Promise<boolean>} True if under the 5-document limit, false otherwise.
 */
async function canUploadDocument(employeeId) {
    const count = await persistence.countDocumentsForEmployee(employeeId)
    return count < MAX_DOCUMENTS
}

/**
 * Saves a document record after a successful upload.
 * @param {string} employeeId - Hex string of the employee's ObjectId.
 * @param {string} filename - The stored filename on disk.
 * @param {string} originalName - The original filename from the user.
 * @returns {Promise<void>}
 */
async function saveDocument(employeeId, filename, originalName) {
    await persistence.saveDocumentRecord(employeeId, filename, originalName)
}

/**
 * Retrieves all document records for a given employee.
 * @param {string} employeeId - Hex string of the employee's ObjectId.
 * @returns {Promise<Array>} Array of document metadata objects.
 */
async function getEmployeeDocuments(employeeId) {
    return await persistence.getDocumentsForEmployee(employeeId)
}

/**
 * Checks whether a document with the given filename exists in the database.
 * Used to authorise file download requests.
 * @param {string} filename - The stored filename to look up.
 * @returns {Promise<Object|null>} The document record, or null if not found.
 */
async function findDocument(filename) {
    return await persistence.findDocumentByFilename(filename)
}

module.exports = {
    listAllEmployees,
    getEmployee,
    viewEmployeeSchedule,
    addEmployee,
    updateEmployee,
    validateEmployeeForm,
    computeShiftDuration,
    validateLogin,
    generateAndSend2FACode,
    verify2FACode,
    createSession,
    getAndExtendSession,
    discardSession,
    logAccess,
    canUploadDocument,
    saveDocument,
    getEmployeeDocuments,
    findDocument,
    MAX_FILE_SIZE,
    MAX_DOCUMENTS
}
