const { MongoClient, ObjectId } = require('mongodb')
 
const CONNECTION_STRING = 'mongodb+srv://60306438_db:12class34@cluster0.bbioymq.mongodb.net/'
const DB_NAME = 'infs3201_winter2026'
 
/**
 * a function that adds a new “employees” array into each shift. 
 *  The employees array will be empty. 
 */
async function addEmptyEmployeesArray(db) {
    const result = await db.collection('shifts').updateMany(
        { employees: { $exists: false } },
        { $set: { employees: [] } }
    )
}
 
/**
 * Write a function that goes through all of the assignments and adds 
 * the employee’s object id (not the E001 number) 
 * to the employees array in the shift collection.
 */
async function embedEmployeesInShifts(db) {
    const assignmentCursor = db.collection('assignments').find({})
    let count = 0
 
    for await (const assignment of assignmentCursor) {
        const employee = await db.collection('employees').findOne(
            { employeeId: assignment.employeeId }
        )
        if (!employee) {
            console.warn(`No employee found for employeeId: ${assignment.employeeId}`)
            continue
        }
 
        const shift = await db.collection('shifts').findOne(
            { shiftId: assignment.shiftId }
        )
        if (!shift) {
            console.warn(`No shift found for shiftId: ${assignment.shiftId}`)
            continue
        }
 
        await db.collection('shifts').updateOne(
            { _id: shift._id },
            { $addToSet: { employees: employee._id } }
        )
        count++
    }
 
}
 
/**
 * Remove the employeeId from the employee collection. 
 */
async function removeEmployeeIdField(db) {
    const result = await db.collection('employees').updateMany(
        {},
        { $unset: { employeeId: '' } }
    )
}
 
/**
 * Remove the shiftId from the shiftCollection.
 */
async function removeShiftIdField(db) {
    const result = await db.collection('shifts').updateMany(
        {},
        { $unset: { shiftId: '' } }
    )
}
 
/**
 * Remove the assignment collection completely.
 */
async function dropAssignmentsCollection(db) {
    await db.collection('assignments').drop()
}
 
/**
 * Migrate function - executes all steps in order.
 */
async function migrate() {
    const client = new MongoClient(CONNECTION_STRING)
    await client.connect()
    const db = client.db(DB_NAME)
    try {
        // await addEmptyEmployeesArray(db)
        // await embedEmployeesInShifts(db)
        // await removeEmployeeIdField(db)
        // await removeShiftIdField(db)
        // await dropAssignmentsCollection(db)
    } catch (err) {
        console.error('Failed:', err)
    } finally {
        await client.close()
    }
}
 
migrate()