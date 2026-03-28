const persistence = require('./persistence')
const crypto = require('crypto')

/**
 * Retrieves all employees in the system.
 */
async function listAllEmployees() {
    return await persistence.loadEmployeesData()
}

/**
 * Retrieves a single employee by their ID.
 */
async function getEmployee(empid) {
    return await persistence.findEmployeeById(empid)
}

/**
 * Retrieves the schedule for a specific employee, sorted by date and start time.
 */
async function viewEmployeeSchedule(empid) {
    const shifts = await persistence.loadShiftsForEmployee(empid)

    // Sort by date then startTime
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
 */
async function updateEmployee(employeeId, name, phone) {
    await persistence.updateEmployee(employeeId, name, phone)
}

/**
 * Validates employee form data. Trims inputs and checks constraints.
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
 */
function computeShiftDuration(startTime, endTime) {
    const startHour = Number(startTime.substring(0, 2))
    const endHour = Number(endTime.substring(0, 2))
    return endHour - startHour
}

/**
 * Hashes a plain-text password using SHA-256.
 */
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex')
}

/**
 * Validates login credentials against the users collection.
 */
async function validateLogin(username, password) {
    const user = await persistence.findUserByUsername(username)
    if (!user) {
        return null
    }
    const hashed = hashPassword(password)
    if (user.passwordHash !== hashed) {
        return null
    }
    return user
}

const SESSION_DURATION_MS = 5 * 60 * 1000 // 5 minutes
/**
 * Generates a random session ID using cryptographically secure random bytes.
 */
function generateSessionId() {
    return crypto.randomBytes(32).toString('hex')
}

/**
 * Creates a new session for the given user and returns the session ID.
 */
async function createSession(username) {
    const sessionId = generateSessionId()
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS)
    await persistence.createSession(sessionId, username, expiresAt)
    return 
    sessionId
}

/**
 * Looks up a session and extends its expiry if valid.
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
 */
async function discardSession(sessionId) {
    await persistence.deleteSession(sessionId)
}

/**
 * Records a security log entry.
 */
async function logAccess(username, url, method) {
    await persistence.logSecurityEvent({
        timestamp: new Date(),
        username: username || null,
        url,
        method
    })
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
    createSession,
    getAndExtendSession,
    discardSession,
    logAccess
}
