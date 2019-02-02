const passport = require('passport');
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = mongoose.model('User');
const promisify = require('es6-promisify');
const mail = require('../handlers/mail');

// local strategy to check if username and password have been put in correctly
exports.login = passport.authenticate('local', {
    failureRedirect: '/login',
    failureFlash: 'Failed Login!',
    successRedirect: '/',
    successFlash: 'You are now logged in!'
});

exports.logout = (req, res) => {
    req.logout();
    req.flash('success', 'You are now logged out! see ya!');
    res.redirect('/');
}

exports.isLoggedIn = (req, res, next) => {
    // first check if user is authenticated
    if(req.isAuthenticated()) {
        next(); // they are logged in, continue on!
        return;
    }
    req.flash('error', 'Oops you must be logged into do this');
    res.redirect('/login');
};

exports.forgot = async (req, res) => {
    // 1. See if the user with that email exists
    const user = await User.findOne({ email: req.body.email });
    if(!user) {
        req.flash('error', 'A password reset has been mailed to you');
        return res.redirect('/login');
    }
    // 2. Set reset tokens and expiry on their account
    user.resetPasswordToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour from now
    await user.save();

    // 3. Send them an email with token 
    const resetURL = `http://${req.headers.host}/account/reset/${user.resetPasswordToken}`;
    await mail.send({
        user,
        subject: 'Password Reset',
        resetURL,
        filename: 'password-reset'
    });
    req.flash('success', `You have been emailed a password reset link.`);

    // 4. redirect to the login page
    res.redirect('/login');
    
};

exports.reset = async (req, res) => {
    const user = await User.findOne({
        resetPasswordToken: req.params.token,
        resetPasswordExpires: { $gt: Date.now() }
    });
    if (!user) {
        req.flash('error', 'Password reset is invalid or has expired');
        return res.redirect('/login');
    }
    // if there IS a user, show the reset password form
    res.render('reset', { title: 'Reset your Password' });
};

exports.confirmedPasswords = (req, res, next) => {
    if (req.body.password == req.body['password-confirm']) {
        next(); // keep it going
        return;
    }
    req.flash('error', 'Passwords do not match!');
    res.redirect('back');
};

exports.update = async (req, res) => {
    const user = await User.findOne({
      resetPasswordToken: req.params.token,
      resetPasswordExpires: { $gt: Date.now() }
    });
    if (!user) {
      req.flash("error", "Password reset is invalid or has expired");
      return res.redirect("/login");
    }
    
    const setPassword = promisify(user.setPassword, user);
    await setPassword(req.body.password);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    const updatedUser = await user.save();
    await req.login(updatedUser);
    req.flash('success', 'Nice! Your password has been reset! You are now logged in.');
    res.redirect('/');
}