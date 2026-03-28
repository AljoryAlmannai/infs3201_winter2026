const express = require('express')
const { engine } = require('express-handlebars')
const business = require('./businessLogicLayer')

const app = express()
const PORT = 8000
const SESSION_COOKIE = "sessionId"

// Set up Handlebars as the view engine
app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: false
}))
app.set('view engine', 'hbs')
app.set('views', './views')

// Middleware for parsing form data
app.use(express.urlencoded({ extended: false }))
app.use(express.static('public'))

/**
 * Security logging middleware.
 */
app.use(async (req, res, next) => {
    const sessionId = parseCookies(req)[SESSION_COOKIE]
    let username = null
 
    if (sessionId) {
        const session = await business.getAndExtendSession(sessionId)
        if (session) {
            username = session.username
            req.session = session
            res.setHeader('Set Cookie', buildCookie(sessionId))
        }
    }
 
    await business.logAccess(username, req.url, req.method)
    next()
})

/**
 * Authentication middleware.
 */
app.use(async (req, res, next) => {
    const publicPaths = ['/login', '/logout']
    if (publicPaths.indexOf(req.path) !== -1) {
        return next()
    }
 
    if (!req.session) {
        return res.redirect('/login?message=Please+log+in+to+continue.')
    }
 
    next()
})

/**
 * Parses the Cookie header into a key-value object.
 * @param {import('express').Request} req - The Express request object.
 * @returns {Object} Cookie key-value pairs.
 */
function parseCookies(req) {
    const cookies = {}
    const header = req.headers['cookie']
    if (!header) {
        return cookies
    }
    const pairs = header.split(';')
    for (let i = 0; i < pairs.length; i++) {
        const parts = pairs[i].trim().split('=')
        cookies[parts[0].trim()] = decodeURIComponent(parts[1] || '')
    }
    return cookies
}
 
/**
 * Builds a Set-Cookie header string for the session cookie.
 */
function buildCookie(sessionId) {
    const expires = new Date(Date.now() + 5 * 60 * 1000).toUTCString()
    return `${SESSION_COOKIE}=${sessionId}; Expires=${expires}; HttpOnly; Path=/`
}
 
/**
 * Clears the session cookie by setting an expired date.
 */
function clearCookie() {
    return `${SESSION_COOKIE}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Path=/`
}

/**
 * Displays the login form. 
 */
app.get('/login', (req, res) => {
    res.render('login', { message: req.query.message || null })
})
 
/**
 * POST /login
 * Validates credentials. On success, creates a session and redirects to /.
 * On failure, redirects back to /login with an error message.
 */
app.post('/login', async (req, res) => {
    const { username, password } = req.body
    const user = await business.validateLogin(username, password)
 
    if (!user) {
        return res.redirect('/login?message=Invalid+username+or+password.')
    }
 
    const sessionId = await business.createSession(user.username)
    res.setHeader('Set-Cookie', buildCookie(sessionId))
    res.redirect('/')
})
 
/**
 * Discards the session, clears the cookie, and redirects to /login.
 */
app.get('/logout', async (req, res) => {
    const sessionId = parseCookies(req)[SESSION_COOKIE]
    if (sessionId) {
        await business.discardSession(sessionId)
    }
    res.setHeader('Set-Cookie', clearCookie())
    res.redirect('/login?message=You+have+been+logged+out.')
})

/**
* Landing page - displays a list of all employees with links to their detail pages.
*/
app.get('/', async (req, res) => {
   const employees = await business.listAllEmployees()
   res.render('index', { employees, username: req.session.username })
})

/**
* GET /employee/:id
* Employee details page - shows employee info and their shift schedule.
* :id is the MongoDB ObjectId hex string.
*/
app.get('/employee/:id', async (req, res) => {
   const empid = req.params.id
   let employee

   try {
       employee = await business.getEmployee(empid)
   } catch (err) {
       return res.send('Invalid employee ID.')
   }

   if (!employee) {
       return res.send('Employee not found.')
   }

   const shifts = await business.viewEmployeeSchedule(empid)

   // Flag shifts with startTime before 12:00 
   const shiftsWithFlag = []
   for (let s of shifts) {
       const hour = Number(s.startTime.substring(0, 2))
       shiftsWithFlag.push({
           date: s.date,
           startTime: s.startTime,
           endTime: s.endTime,
           morning: hour < 12
       })
   }

   res.render('employee', {
       employee,
       employeeId: empid,
       shifts: shiftsWithFlag,
       username: req.session.username
   })
})

/**
* Edit employee details page.
*/
app.get('/employee/:id/edit', async (req, res) => {
   const empid = req.params.id
   let employee

   try {
       employee = await business.getEmployee(empid)
   } catch (err) {
       return res.send('Invalid employee ID.')
   }

   if (!employee) {
       return res.send('Employee not found.')
   }

   res.render('editEmployee', {
       employee,
       employeeId: empid,
       username: req.session.username
   })
})

/**
* Validates input server-side and redirects to the landing page on success.
*/
app.post('/employee/:id/edit', async (req, res) => {
   const empid = req.params.id
   const { name, phone } = req.body

   const validation = business.validateEmployeeForm(name, phone)

   if (!validation.valid) {
       return res.send(validation.error)
   }

   try {
       await business.updateEmployee(empid, validation.name, validation.phone)
   } catch (err) {
       return res.send('Failed to update employee.')
   }

   res.redirect('/')
})


app.listen(PORT, () => {
    console.log(`Server running ...`)
})
