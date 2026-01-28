const fs = require('fs/promises')
const prompt = require('prompt-sync')()


// This function will read the employees.json file and return an array of JSON objects
// that represent the employees in the system.
async function loadEmployeesData() {
    let raw = await fs.readFile("employees.json", "utf-8")
    let result = JSON.parse(raw)
    return result

}

// This function will read the shifts.json file and return an array of JSON objects
// that represent the shifts in the system.
async function loadShiftsData() {
    let raw = await fs.readFile("shifts.json", "utf-8")
    let result = JSON.parse(raw)
    return result

}

// This function will read the assignments.json file and return an array of JSON objects
// that represent the assignments in the system.
async function loadAssignmentsData() {
    let raw = await fs.readFile("assignments.json", "utf-8")
    let result = JSON.parse(raw)
    return result

}

// This function will save the employeeList array of courses into the file employees.json.  
async function saveEmployeesData(employeeList) {
    await fs.writeFile("employees.json", JSON.stringify(employeeList, null, 2))

}

// This function will save the assignmentsList array of courses into the file assignments.json. 
async function saveAssignmentsData(assignmentsList) {
    await fs.writeFile("assignments.json", JSON.stringify(assignmentsList, null, 2))

}

// This function will display all of the employees currently in the system.
// The output will be:
// EmployeeID,   Name,   Phone
//
// 
// The function takes no parameters and prints employees with their id, name and phone number.
async function listAllEmployees() {
    let employees = await loadEmployeesData()
    console.log("EmployeeID  Name                   Phone")
    console.log("----------  --------------------   ----------")
    for (let e of employees) {
        console.log(`${e.employeeId}     ${e.name}             ${e.phone}`)
    }

}

// This function will display the schedule of an employee currently in the system based on a given ID.
// The output will be:
// date,startTime,endTime
//
// 
// The function takes employeeId as a parameter and returns the shift date, startTime and endTime.
async function viewEmployeeSchedule(empid) {
    shiftList= await loadShiftsData()
    assignmentsList= await loadAssignmentsData()

    console.log("date,startTime,endTime")

    for(let a of assignmentsList){
        if(a.employeeId===empid){
            let shift=a.shiftId
            for(let s of shiftList){
                if(s.shiftId===shift){
                    console.log(`${s.date},${s.startTime},${s.endTime}`)
                }
            }
        }
    }

}

// This function will assign employee to a shift. 
//
// If there is no employee with the given id then print the message "Employee does not exist".
// If there is no shift with the given id then print the message "Shift does not exist".
// If the chosen employee is assigned already with the shift then print the message "Employee already assigned to shift".
//
// The parameter is the employee id and shift id.  The function does not return any
// value.

async function assignEmployee(empid, shiftid){
    employeeList = await loadEmployeesData()
    shiftList= await loadShiftsData()
    assignmentsList= await loadAssignmentsData()
    let empfound=false
    let shiftfound=false
    let assignedfound=false

    for (let e of employeeList) {
        if (e.employeeId === empid) {
            empfound=true
            break
        }
    }
    if(!empfound){
        console.log("Employee does not exist")
        return
    }

    for (let s of shiftList) {
        if (s.shiftId === shiftid) {
            shiftfound=true
            break
        }
        
    }

    if(!shiftfound){
        console.log("shift does not exist")
        return
    }

    
    for (let a of assignmentsList) {
        if (a.employeeId === empid && a.shiftId===shiftid) {
            assignedfound=true
            break
        } 
    }
    if(assignedfound){
        console.log("Employee already assigned to shift")
        return
    }
    
    assignmentsList.push({
            employeeId: empid,
            shiftId: shiftid
        })

        await saveAssignmentsData(assignmentsList)
        console.log("Shift Recorded")
        

}


// This function will update the employee list.  If the employee does not exist, print a message
// "Employee is in the list".
//
// The function does not return any value.
async function addEmployee(name, phone) {

    employeeList = await loadEmployeesData()
    let found=false
    for (let e of employeeList) {
        if (e.name === name && e.phone===phone) {
            console.log("Employee is in the list")
            found=true
            break
        }
    }

    if(found === false){
        let idnum=employeeList.length+1
        let employeeId="E00"+idnum

        employeeList.push({
                employeeId: employeeId,
                name: name,
                phone: phone
            })
        await saveEmployeesData(employeeList)
        console.log("Employee Added ...")
        }
    }
    


async function app() {
    while (true) {
        console.log('Options:')
        console.log('1. Show all employees')
        console.log('2. Add new employee')
        console.log('3. Assign employee to shift')
        console.log('4. View employee schedule')
        console.log('5. Exit')
        let selection = Number(prompt("What is your choice> "))
        if (selection == 1) {
            await listAllEmployees()
        }
        else if (selection == 2) {
            let name = prompt("Enter employee name: ")
            let phone = prompt("Enter phone number: ")
            await addEmployee(name, phone)
        }
        else if (selection == 3){
            let empid=prompt("Enter employee ID: ")
            let shiftid = prompt("Enter shift ID: ")
            await assignEmployee(empid,shiftid)

        }
        else if (selection == 4) {
            let empid = prompt("Enter employee ID: ")
            await viewEmployeeSchedule(empid)
        }
        else if (selection == 5) {
            break // leave the loop
        }
        else {
            console.log('******** ERROR!!! Pick a number between 1 and 5')
        }
    }

}

app()