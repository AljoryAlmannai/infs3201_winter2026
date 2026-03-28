const { MongoClient } = require('mongodb')

const CONNECTION_STRING = 'mongodb+srv://Aljory:****@cluster0.zzjcbdu.mongodb.net/'
const DB_NAME = 'infs3201_winter2026'

let db = null

/**
 * Connects to the MongoDB database. Reuses existing connection if already established.
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
 * @returns Array of employee documents.
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
 * @returns Array of shift documents.
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
 * @returns Configuration object with maxDailyHours.
 */
async function loadConfigData() {
    const fs = require('fs/promises')
    const raw = await fs.readFile('config.json', 'utf-8')
    return JSON.parse(raw)
}

/**
 * Finds a single employee by their MongoDB ObjectID string.
 */
async function findEmployeeById(employeeId) {
    const database = await connect()
    return await database.collection('employees').findOne({ _id: new ObjectId(employeeId)})
}

/**
 * Retrieves all shifts assigned to a specific employee.
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
 */
async function saveEmployee(employee) {
    const database = await connect()
    await database.collection('employees').insertOne(employee)
}

/**
 * Updates an existing employee's name and phone number in the database.
 */
async function updateEmployee(employeeId, name, phone) {
    const database = await connect()
    await database.collection('employees').updateOne(
        { _id: new ObjectId(employeeId)},
        { $set: { name, phone }}
    )
}

/**
 * Finds a user in the users collection by username.
 */
async function findUserByUsername(username) {
    const database = await connect()
    return await database.collection('users').findOne({ username})
}

/**
 * Creates a new session document in the sessions collection.
 */
async function createSession(sessionId, username, expiresAt) {
    const database = await connect()
    await database.collection('sessions').insertOne({sessionId, username, expiresAt})
}

/**
 * Finds a session document by session ID, but only if it has not expired.
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
 */
async function deleteSession(sessionId) {
    const database = await connect()
    await database.collection('sessions').deleteOne({sessionId})
}

/**
 * Appends an entry to the security_log collection.
 */
async function logSecurityEvent(entry) {
    const database = await connect()
    await database.collection('security_log').insertOne(entry)
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
    logSecurityEvent
}
