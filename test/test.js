var assert = require('assert');

describe('Array', function() {
  describe('#indexOf()', function() {
    it('should return -1 when the value is not present', function() {
      assert.equal(-1, [1,2,3].indexOf(4));
    });
  });
});


describe('Elemental Machines API Client', function() {

    emClient = require('../lib/elemental_machines_api');
    var api = new emClient();

    describe('Initialization', function() {
        it('Authentication', function() {
            api.authenticate({username:'', password:''}, function() {
                assert.notEqual(api.access_token, '');
            });
        })
    })

    describe('Email Functionality', function() {
        var email = require('emailjs');
        var server  = email.server.connect({
           user:    "username",
           password:"password",
           host:    "smtp.your-email.com",
           ssl:     true
        });

        server.send({
               text:    "i hope this works",
               from:    "you <username@your-email.com>",
               to:      "someone <someone@your-email.com>, another <another@your-email.com>",
               cc:      "else <else@your-email.com>",
               subject: "testing emailjs"
            }, function(err, message) {
                assert.Equal(err, null);
                //console.log(err || message);
        });

    });

    describe('Alerts', function() {
        it('Send Email', function() {
            assert(true, 'Assert True');
            assert.notEqual(api, undefined);

            api.users = [
                {
                    email: 'pmorris96@gmail.com'
                }
            ];
            recipients = api.sendEmailAlerts('my test content', 'my test subject');
            assert.equal(recipients, 1);
        });
    })
})