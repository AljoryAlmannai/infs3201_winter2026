
const { MongoClient } = require('mongodb')
const fs = require('fs/promises')

const CONNECTION_STRING = 'mongodb+srv://Aljory:Almannai09@cluster0.zzjcbdu.mongodb.net/'
const DB_NAME = 'infs3201_winter2026'

async function seed() {
    async function seed() {
        const client = new MongoClient(CONNECTION_STRING)
        await client.connect()
        const db = client.db(DB_NAME)
     
        const rawEmployees = JSON.parse(await fs.readFile('employees.json', 'utf-8'))
        const rawShifts = JSON.parse(await fs.readFile('shifts.json', 'utf-8'))
        const assignments = JSON.parse(await fs.readFile('assignments.json', 'utf-8'))
     
        const employees = []
        for (let e of rawEmployees) {
            employees.push({ name: e.name, phone: e.phone })
        }
     
        const shifts = []
        for (let s of rawShifts) {
            shifts.push({
                date: s.date,
                startTime: s.startTime,
                endTime: s.endTime,
                employees: []
            })
        }
     
    
        await db.collection('employees').deleteMany({})
        await db.collection('shifts').deleteMany({})
        await db.collection('sessions').deleteMany({})
        await db.collection('security_log').deleteMany({})
     
        const insertedEmployees = await db.collection('employees').insertMany(employees)
        
        const empIdMap = {}
        for (let i = 0; i < rawEmployees.length; i++) {
            empIdMap[rawEmployees[i].employeeId] = insertedEmployees.insertedIds[i]
        }
     
       
        const insertedShifts = await db.collection('shifts').insertMany(shifts)
        const shiftIdMap = {}
        for (let i = 0; i < rawShifts.length; i++) {
            shiftIdMap[rawShifts[i].shiftId] = insertedShifts.insertedIds[i]
        }
     
        for (let a of assignments) {
            const empObjId = empIdMap[a.employeeId]
            const shiftObjId = shiftIdMap[a.shiftId]
            if (empObjId && shiftObjId) {
                await db.collection('shifts').updateOne(
                    { _id: shiftObjId },
                    { $addToSet: { employees: empObjId } }
                )
            }
        }
     
        await client.close()
    }
     
    seed().catch(console.error)}