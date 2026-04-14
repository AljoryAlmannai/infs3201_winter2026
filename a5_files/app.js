const express = require('express')
const { engine } = require('express-handlebars')
const multer = require('multer')
const path = require('path')
const fs = require('fs/promises')
const business = require('./businessLogicLayer')

const app = express()
const PORT = 8000
const SESSION_COOKIE = 'sessionId'

// Directory where uploaded documents are stored (outside public/)
const UPLOAD_DIR = path.join(__dirname, 'uploads')

// Ensure uploads directory exists at startup
fs.mkdir(UPLOAD_DIR, { recursive: true }).catch(console.error)

// ─── Handlebars ──────────────────────────────────────────────────────────────

app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: false
}))
app.set('view engine', 'hbs')
app.set('views', './views')

// ─── General Middleware ──────────────────────────────────────────────────────

app.use(express.urlencoded({ extended: false }))
app.use(express.static('public'))

/**
 * Security logging middleware — runs on every request.
 */
app.use(async (req, res, next) => {
    const sessionId = parseCookies(req)[SESSION_COOKIE]
    let username = null

    if (sessionId) {
        const session = await business.getAndExtendSession(sessionId)
        if (session) {
            username = session.username
            req.session = session
            res.setHeader('Set-Cookie', buildCookie(sessionId))
        }
    }

    await business.logAccess(username, req.url, req.method)
    next()
})

/**
 * Authentication middleware — protects all routes except login/logout.
 */
app.use(async (req, res, next) => {
    const publicPaths = ['/login', '/logout', '/2fa']
    if (publicPaths.indexOf(req.path) !== -1) {
        return next()
    }

    if (!req.session) {
        return res.redirect('/login?message=Please+log+in+to+continue.')
    }

    next()
})

// ─── Cookie Helpers ──────────────────────────────────────────────────────────

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
 * @param {string} sessionId - The session ID value.
 * @returns {string} The formatted Set-Cookie string.
 */
function buildCookie(sessionId) {
    const expires = new Date(Date.now() + 5 * 60 * 1000).toUTCString()
    return `${SESSION_COOKIE}=${sessionId}; Expires=${expires}; HttpOnly; Path=/`
}

/**
 * Returns a Set-Cookie header string that clears the session cookie.
 * @returns {string} The formatted Set-Cookie string with expired date.
 */
function clearCookie() {
    return `${SESSION_COOKIE}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Path=/`
}

// ─── Multer Setup ────────────────────────────────────────────────────────────

/**
 * Multer disk storage — saves files to UPLOAD_DIR with unique names.
 */
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR)
    },
    filename: (req, file, cb) => {
        // Prefix with timestamp + random bytes to avoid collisions
        const unique = Date.now() + '-' + Math.round(Math.random() * 1e9)
        cb(null, unique + path.extname(file.originalname))
    }
})

/**
 * Multer file filter — only PDF files are accepted.
 * @param {import('express').Request} req
 * @param {Express.Multer.File} file
 * @param {Function} cb
 */
function fileFilter(req, file, cb) {
    if (file.mimetype === 'application/pdf') {
        cb(null, true)
    } else {
        cb(new Error('Only PDF files are permitted.'), false)
    }
}

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: business.MAX_FILE_SIZE }
})

// ─── Login / Logout ──────────────────────────────────────────────────────────

/**
 * GET /login — Displays the login form.
 */
app.get('/login', (req, res) => {
    res.render('login', { message: req.query.message || null })
})

/**
 * POST /login — Validates credentials.
 * On success, generates a 2FA code and redirects to the 2FA page.
 * On failure, redirects back with an error message.
 */
app.post('/login', async (req, res) => {
    const { username, password } = req.body
    const result = await business.validateLogin(username, password)

    if (result.locked) {
        return res.redirect('/login?message=This+account+has+been+locked.+Contact+your+administrator.')
    }

    if (!result.success) {
        return res.redirect('/login?message=Invalid+username+or+password.')
    }

    // Credentials are correct — issue 2FA code
    const user = result.user
    if (user.email) {
        await business.generateAndSend2FACode(username, user.email)
    } else {
        // Fallback: log the code since no email is configured on this account
        await business.generateAndSend2FACode(username, 'console@example.com')
    }

    // Store username in a short-lived cookie so the 2FA page knows who to check
    res.setHeader('Set-Cookie', `pending2fa=${username}; HttpOnly; Path=/; Max-Age=300`)
    res.redirect('/2fa')
})

/**
 * GET /2fa — Displays the 2FA code entry form.
 */
app.get('/2fa', (req, res) => {
    const cookies = parseCookies(req)
    if (!cookies.pending2fa) {
        return res.redirect('/login?message=Please+log+in+first.')
    }
    res.render('twofa', { message: req.query.message || null })
})

/**
 * POST /2fa — Verifies the submitted 2FA code.
 * On success, creates the session and redirects to /.
 * On failure, redirects back with an error message.
 */
app.post('/2fa', async (req, res) => {
    const cookies = parseCookies(req)
    const username = cookies.pending2fa

    if (!username) {
        return res.redirect('/login?message=Session+expired.+Please+log+in+again.')
    }

    const { code } = req.body
    const valid = await business.verify2FACode(username, code)

    if (!valid) {
        return res.redirect('/2fa?message=Invalid+or+expired+code.+Please+try+again.')
    }

    // Clear the pending 2FA cookie
    res.setHeader('Set-Cookie', [
        `pending2fa=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Path=/`,
        buildCookie(await business.createSession(username))
    ])
    res.redirect('/')
})

/**
 * GET /logout — Discards the session, clears the cookie, redirects to /login.
 */
app.get('/logout', async (req, res) => {
    const sessionId = parseCookies(req)[SESSION_COOKIE]
    if (sessionId) {
        await business.discardSession(sessionId)
    }
    res.setHeader('Set-Cookie', clearCookie())
    res.redirect('/login?message=You+have+been+logged+out.')
})

// ─── Employees ───────────────────────────────────────────────────────────────

/**
 * GET / — Landing page displaying all employees.
 */
app.get('/', async (req, res) => {
    const employees = await business.listAllEmployees()
    res.render('index', { employees, username: req.session.username })
})

/**
 * GET /employee/:id — Employee detail page with shifts and documents link.
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
 * GET /employee/:id/edit — Edit employee form.
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
 * POST /employee/:id/edit — Saves updated employee name and phone.
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

// ─── Documents ───────────────────────────────────────────────────────────────

/**
 * GET /employee/:id/documents — Shows document list and upload form for an employee.
 */
app.get('/employee/:id/documents', async (req, res) => {
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

    const documents = await business.getEmployeeDocuments(empid)

    res.render('documents', {
        employee,
        employeeId: empid,
        documents,
        atLimit: documents.length >= business.MAX_DOCUMENTS,
        username: req.session.username,
        message: req.query.message || null
    })
})

/**
 * POST /employee/:id/documents — Handles a PDF upload for the employee.
 * Enforces: PDF only, max 2MB, max 5 documents per employee.
 */
app.post('/employee/:id/documents', (req, res) => {
    const empid = req.params.id

    // Run multer manually so we can handle its errors cleanly
    upload.single('document')(req, res, async (err) => {
        if (err) {
            // Multer errors (wrong type, file too large, etc.)
            const msg = encodeURIComponent(err.message || 'Upload failed.')
            return res.redirect(`/employee/${empid}/documents?message=${msg}`)
        }

        if (!req.file) {
            return res.redirect(`/employee/${empid}/documents?message=No+file+selected.`)
        }

        // Check document limit
        const allowed = await business.canUploadDocument(empid)
        if (!allowed) {
            // Delete the file we just wrote since we can't keep it
            await fs.unlink(req.file.path).catch(() => {})
            return res.redirect(`/employee/${empid}/documents?message=Maximum+of+5+documents+already+reached.`)
        }

        await business.saveDocument(empid, req.file.filename, req.file.originalname)
        res.redirect(`/employee/${empid}/documents?message=Document+uploaded+successfully.`)
    })
})

/**
 * GET /documents/:filename — Serves a stored document to authenticated users only.
 * Documents are NOT served via a public static route.
 */
app.get('/documents/:filename', async (req, res) => {
    const { filename } = req.params

    // Verify the file exists in our database (prevents path traversal / guessing)
    const record = await business.findDocument(filename)
    if (!record) {
        return res.status(404).send('Document not found.')
    }

    const filePath = path.join(UPLOAD_DIR, filename)

    // Send the file with the original filename as the download name
    res.setHeader('Content-Disposition', `inline; filename="${record.originalName}"`)
    res.setHeader('Content-Type', 'application/pdf')
    res.sendFile(filePath)
})

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})
