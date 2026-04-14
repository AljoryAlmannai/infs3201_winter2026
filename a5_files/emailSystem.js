/**
 * @fileoverview Email system module.
 * Simulates sending emails via console.log.
 * The rest of the system uses only the exported functions and
 * does not know that the implementation is console-based.
 */

/**
 * Core send function — all email output goes through here.
 * @param {string} to - Recipient email address.
 * @param {string} subject - Subject line.
 * @param {string} body - Plain-text body.
 * @returns {Promise<void>}
 */
async function sendEmail(to, subject, body) {
    console.log('========== EMAIL ==========')
    console.log(`To:      ${to}`)
    console.log(`Subject: ${subject}`)
    console.log(`Body:\n${body}`)
    console.log('===========================')
}

/**
 * Sends a 2FA verification code to the user.
 * @param {string} to - Recipient email address.
 * @param {string} code - The 6-digit verification code.
 * @returns {Promise<void>}
 */
async function send2FACode(to, code) {
    const subject = 'Your Login Verification Code'
    const body = `Your 2-factor authentication code is: ${code}\n\nThis code will expire in 3 minutes.\n\nIf you did not request this, please contact your administrator.`
    await sendEmail(to, subject, body)
}

/**
 * Sends a suspicious activity warning after several failed login attempts.
 * @param {string} to - Recipient email address.
 * @param {string} username - The username that triggered the alert.
 * @returns {Promise<void>}
 */
async function sendSuspiciousActivityWarning(to, username) {
    const subject = 'Suspicious Login Activity Detected'
    const body = `Hello,\n\nWe detected multiple failed login attempts on the account "${username}".\n\nIf this was not you, please contact your administrator immediately.\n\nEmployee Scheduling System`
    await sendEmail(to, subject, body)
}

/**
 * Sends an account locked notification after too many failed attempts.
 * @param {string} to - Recipient email address.
 * @param {string} username - The locked account username.
 * @returns {Promise<void>}
 */
async function sendAccountLockedNotification(to, username) {
    const subject = 'Your Account Has Been Locked'
    const body = `Hello,\n\nYour account "${username}" has been locked due to 10 or more failed login attempts.\n\nPlease contact your administrator to unlock your account.\n\nEmployee Scheduling System`
    await sendEmail(to, subject, body)
}

module.exports = {
    send2FACode,
    sendSuspiciousActivityWarning,
    sendAccountLockedNotification
}
