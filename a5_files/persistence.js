const { MongoClient, ObjectId } = require('mongodb')

const CONNECTION_STRING = 'mongodb+srv://60306438_db:12class34@cluster0.bbioymq.mongodb.net/'
const DB_NAME = 'infs3201_winter2026'

let db = null

/**
 * Connects to the MongoDB database. Reuses existing connection if already established.
 * @returns {Promise<import('mongodb').Db>} The connected database instance.
 */
async function connect() {
    if (!db) {
        const client = new MongoClient(CONNECTION_STRING)
        await client.connect()
        db = client.db(DB_NAME)
    }
    return db
}

/**
 * Retrieves all employees from the database.
 * @returns {Promise<Array>} Array of employee documents.
 */
async function loadEmployeesData() {
    const database = await connect()
    const result = []
    const cursor = database.collection('employees').find({})
    for await (const doc of cursor) {
        result.push(doc)
    }
    return result
}

/**
 * Retrieves all shifts from the database.
 * @returns {Promise<Array>} Array of shift documents.
 */
async function loadShiftsData() {
    const database = await connect()
    const result = []
    const cursor = database.collection('shifts').find({})
    for await (const doc of cursor) {
        result.push(doc)
    }
    return result
}

/**
 * Loads the application configuration from the config.json file.
 * @returns {Promise<Object>} Configuration object with maxDailyHours.
 */
async function loadConfigData() {
    const fs = require('fs/promises')
    const raw = await fs.readFile('config.json', 'utf-8')
    return JSON.parse(raw)
}

/**
 * Finds a single employee by their MongoDB ObjectId string.
 * @param {string} employeeId - Hex string of the MongoDB ObjectId.
 * @returns {Promise<Object|null>} The employee document, or null if not found.
 */
async function findEmployeeById(employeeId) {
    const database = await connect()
    return await database.collection('employees').findOne({ _id: new ObjectId(employeeId) })
}

/**
 * Retrieves all shifts assigned to a specific employee.
 * @param {string} employeeId - Hex string of the MongoDB ObjectId.
 * @returns {Promise<Array>} Array of shift documents for that employee.
 */
async function loadShiftsForEmployee(employeeId) {
    const database = await connect()
    const empObjectId = new ObjectId(employeeId)

    const result = []
    const cursor = database.collection('shifts').find({ employees: empObjectId })
    for await (const doc of cursor) {
        result.push(doc)
    }
    return result
}

/**
 * Saves a new employee document to the database.
 * @param {Object} employee - Employee object with name and phone fields.
 * @returns {Promise<void>}
 */
async function saveEmployee(employee) {
    const database = await connect()
    await database.collection('employees').insertOne(employee)
}

/**
 * Updates an existing employee's name and phone number in the database.
 * @param {string} employeeId - Hex string of the MongoDB ObjectId.
 * @param {string} name - New name value.
 * @param {string} phone - New phone value.
 * @returns {Promise<void>}
 */
async function updateEmployee(employeeId, name, phone) {
    const database = await connect()
    await database.collection('employees').updateOne(
        { _id: new ObjectId(employeeId) },
        { $set: { name, phone } }
    )
}

/**
 * Finds a user in the users collection by username.
 * @param {string} username - The username to look up.
 * @returns {Promise<Object|null>} The user document, or null if not found.
 */
async function findUserByUsername(username) {
    const database = await connect()
    return await database.collection('users').findOne({ username })
}

/**
 * Creates a new session document in the sessions collection.
 * @param {string} sessionId - The unique session identifier.
 * @param {string} username - The username associated with the session.
 * @param {Date} expiresAt - Expiry date for the session.
 * @returns {Promise<void>}
 */
async function createSession(sessionId, username, expiresAt) {
    const database = await connect()
    await database.collection('sessions').insertOne({ sessionId, username, expiresAt })
}

/**
 * Finds a session document by session ID, but only if it has not expired.
 * @param {string} sessionId - The session ID to look up.
 * @returns {Promise<Object|null>} The session document, or null if not found/expired.
 */
async function findSession(sessionId) {
    const database = await connect()
    return await database.collection('sessions').findOne({
        sessionId,
        expiresAt: { $gt: new Date() }
    })
}

/**
 * Updates the expiry time of an existing session.
 * @param {string} sessionId - The session ID to update.
 * @param {Date} newExpiresAt - The new expiry date.
 * @returns {Promise<void>}
 */
async function extendSession(sessionId, newExpiresAt) {
    const database = await connect()
    await database.collection('sessions').updateOne(
        { sessionId },
        { $set: { expiresAt: newExpiresAt } }
    )
}

/**
 * Deletes a session document from the database.
 * @param {string} sessionId - The session ID to delete.
 * @returns {Promise<void>}
 */
async function deleteSession(sessionId) {
    const database = await connect()
    await database.collection('sessions').deleteOne({ sessionId })
}

/**
 * Appends an entry to the security_log collection.
 * @param {Object} entry - Log entry with timestamp, username, url, and method.
 * @returns {Promise<void>}
 */
async function logSecurityEvent(entry) {
    const database = await connect()
    await database.collection('security_log').insertOne(entry)
}

// ─── 2FA ────────────────────────────────────────────────────────────────────

/**
 * Saves a 2FA token record for the given username.
 * Replaces any existing pending token for that user.
 * @param {string} username - The username this token belongs to.
 * @param {string} code - The 6-digit code.
 * @param {Date} expiresAt - When the code expires (3 minutes from creation).
 * @returns {Promise<void>}
 */
async function saveTwoFactorCode(username, code, expiresAt) {
    const database = await connect()
    await database.collection('twofa_tokens').replaceOne(
        { username },
        { username, code, expiresAt, attempts: 0 },
        { upsert: true }
    )
}

/**
 * Retrieves an unexpired 2FA token record for a username.
 * @param {string} username - The username to look up.
 * @returns {Promise<Object|null>} The token document, or null if not found/expired.
 */
async function findTwoFactorCode(username) {
    const database = await connect()
    return await database.collection('twofa_tokens').findOne({
        username,
        expiresAt: { $gt: new Date() }
    })
}

/**
 * Deletes the 2FA token for a username after successful verification.
 * @param {string} username - The username whose token to remove.
 * @returns {Promise<void>}
 */
async function deleteTwoFactorCode(username) {
    const database = await connect()
    await database.collection('twofa_tokens').deleteOne({ username })
}

// ─── Failed Login Tracking ───────────────────────────────────────────────────

/**
 * Increments the failed login counter for a user.
 * Creates the record if it doesn't exist.
 * @param {string} username - The username that failed to log in.
 * @returns {Promise<number>} The new total failed attempt count.
 */
async function incrementFailedLogins(username) {
    const database = await connect()
    const result = await database.collection('users').findOneAndUpdate(
        { username },
        { $inc: { failedLoginAttempts: 1 } },
        { returnDocument: 'after' }
    )
    return result ? result.failedLoginAttempts : 1
}

/**
 * Resets the failed login counter for a user after a successful login.
 * @param {string} username - The username to reset.
 * @returns {Promise<void>}
 */
async function resetFailedLogins(username) {
    const database = await connect()
    await database.collection('users').updateOne(
        { username },
        { $set: { failedLoginAttempts: 0 } }
    )
}

/**
 * Locks a user account in the database.
 * @param {string} username - The username to lock.
 * @returns {Promise<void>}
 */
async function lockAccount(username) {
    const database = await connect()
    await database.collection('users').updateOne(
        { username },
        { $set: { locked: true } }
    )
}

// ─── Employee Documents ──────────────────────────────────────────────────────

/**
 * Saves document metadata to the database for a given employee.
 * @param {string} employeeId - Hex string of the employee's ObjectId.
 * @param {string} filename - The stored filename on the filesystem.
 * @param {string} originalName - The original uploaded filename.
 * @returns {Promise<void>}
 */
async function saveDocumentRecord(employeeId, filename, originalName) {
    const database = await connect()
    await database.collection('documents').insertOne({
        employeeId: new ObjectId(employeeId),
        filename,
        originalName,
        uploadedAt: new Date()
    })
}

/**
 * Retrieves all document records for a given employee.
 * @param {string} employeeId - Hex string of the employee's ObjectId.
 * @returns {Promise<Array>} Array of document metadata documents.
 */
async function getDocumentsForEmployee(employeeId) {
    const database = await connect()
    const result = []
    const cursor = database.collection('documents').find({ employeeId: new ObjectId(employeeId) })
    for await (const doc of cursor) {
        result.push(doc)
    }
    return result
}

/**
 * Counts how many documents an employee currently has uploaded.
 * @param {string} employeeId - Hex string of the employee's ObjectId.
 * @returns {Promise<number>} The document count.
 */
async function countDocumentsForEmployee(employeeId) {
    const database = await connect()
    return await database.collection('documents').countDocuments({ employeeId: new ObjectId(employeeId) })
}

/**
 * Finds a single document record by its stored filename.
 * @param {string} filename - The stored filename to look up.
 * @returns {Promise<Object|null>} The document record, or null if not found.
 */
async function findDocumentByFilename(filename) {
    const database = await connect()
    return await database.collection('documents').findOne({ filename })
}

module.exports = {
    loadEmployeesData,
    loadShiftsData,
    loadConfigData,
    findEmployeeById,
    loadShiftsForEmployee,
    saveEmployee,
    updateEmployee,
    findUserByUsername,
    createSession,
    findSession,
    extendSession,
    deleteSession,
    logSecurityEvent,
    // 2FA
    saveTwoFactorCode,
    findTwoFactorCode,
    deleteTwoFactorCode,
    // Failed login tracking
    incrementFailedLogins,
    resetFailedLogins,
    lockAccount,
    // Documents
    saveDocumentRecord,
    getDocumentsForEmployee,
    countDocumentsForEmployee,
    findDocumentByFilename
}
