var request = require('request');
var moment = require('moment');

var email = require('emailjs');
var email_server  = email.server.connect({
   user:    "username",
   password:"password",
   host:    "smtp.your-email.com",
   ssl:     true
});

var twilio = require('twilio');
var twilioClient = new twilio.RestClient('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN');



module.exports = class ElementalMachinesApi {

   constructor() {;
        this.base_url = 'https://api.elementalmachines.io/';

        // for testing purposes ONLY
        this.access_token = '7eb3d0a32f2ba1e8039657ef2bd1913d95707ff53e37dfd0344ac62ded3df033';

        this.users = [];

        this.mailServerConnect();

    }

    mailServerConnect() {
        this.mailServer  = email.server.connect({
           user:    "emtest@philmorris.net",
           password:"emtest1234",
           host:    "philmorris.net",
           ssl:     true
        });
    }

    authenticate(params, callback, error) {

        if (this.access_token == null) {
            var uri = 'oauth/token';
            // make http request and set this.access token
            // this.access_token = response.access_token
        }

        if (error && this.access_token == null) {
            error()
            return;
        }

        if (callback) {
            callback();
            return;
        }

    }

    /**
     * Retrieve and retain the users
     * @param  {Function} callback [description]
     * @return {[type]}            [description]
     */
    loadUsers(machineMonitor, callback) {
        var uri = 'api/users.json';
        var requestOptions = {
            url: this.base_url + uri,
            qs: {
                access_token: this.access_token
            },
            json: true
        }

        request.get(requestOptions, function(error, response, body) {
            if (!error && response.statusCode == 200) {
                machineMonitor.users = body;

                console.log('Users loaded: ' + machineMonitor.users.length);

                if (callback) {
                    callback();
                }
            } else {
                console.log('Error retrieving users from API: ' + body.error);
            }
        });
    }

    logAlert(machine, status) {

    }

    setUsers(users) {
        this.users = users;
    }

    sendSmsAlert(content) {

        var numRecipients = 0;

        for (var i=0; i<this.users.length; i++) {
            if (this.users[i].email) {
                // send email to user
                twilioClient.sms.messages.create({
                        to: this.users[i].mobile.replace('-', ''),
                        from: 'TWILIO_NUMBER',
                        body: content
                    }, function(error, message) {
                            if(error) {
                                console.error('Failed to send SMS Alert to User: ' + this.users[i].mobile)
                            }
                        }
                );
                numRecipients++;
            }
        }

        return numRecipients;
    }

    sendEmailAlerts(content, subject) {

        var recipients = [];
        // console.log(this.users[0]);
        for (var i=0; i<this.users.length; i++) {
            if (this.users[i].email) {
                // send email to user
                recipients.push(this.users[i].email);
            }
        }

        if (recipients.length > 0) {
            var message = {
                    text:    content,
                    from:    'eat@joes.com',
                    to:      recipients.join(),
                    subject: subject,
                    attachment: [
                        {data:"<html>i <i>hope</i> this works!</html>", alternative:true}
                    ]
                };
            email_server.send(message, function(error, message) {
                if (error) {
                    console.error('Email alert could not be sent due to error: ' + error);
                }
            });
        }
        return recipients.length;
    }


    loadAlertSettings(machineMonitor, callback) {
        var uri = 'api/alert_settings.json';
        var requestOptions = {
            url: this.base_url + uri,
            qs: {
                access_token: this.access_token,
                machine_uuid: machineMonitor.uuid
            },
            json: true
        }

        console.log('getting settings for machine: ' + machineMonitor.uuid);
        request.get(requestOptions, function(error, response, body) {
            if (!error && response.statusCode == 200) {

                // add all enabled alert settings to the monitor
                for(i=0; i<body.length; i++) {
                    if (body[i].enabled) {
                        machineMonitor.addAlertSetting(body[i].sample_var, body[i]);
                        machineMonitor.setDelayInterval(body[i].set_delay * 1000);
                    }
                }


                if(callback) {
                    callback();
                }

            } else {
                // TODO Improve handling of 401 AND 403 responses
                console.error('Could not get alert settings\n ^^^ ' + body.error + ': ' + uuid);
            }
        });

    }

    getMachineInfo(machineMonitor, callback) {
        var uri = 'api/machines/' + machineMonitor.uuid + '/samples.json';
        console.log('gatting machine info for: ' + machineMonitor.uuid);
        var timestamp = Math.round(moment().add({seconds:-20}).valueOf() / 1000);

        var requestOptions = {
            url: this.base_url + uri,
            timeout: 4000,
            json: true,
            qs: {
                access_token: this.access_token,
                machine_uuid: machineMonitor.uuid,
                from: timestamp,
                limit: 3
            }
        }
        console.log(requestOptions);
        console.log(machineMonitor.alertSettings);
        var mm = this;
        request.get(requestOptions, function(error, response, body) {
            if (response.statusCode == 200 && body.length > 0) {
                console.log(body);
                var data = body.pop();
                console.log ('recieved machine info for: ' + machineMonitor.uuid);

                callback(data);
                return;

                if (timestamp <= MachineMonitor.statuses.tempextcal.lastReading)

                // var passed = data.tempextal
                var currentStatus = machineMonitor.alertSettings.tempextcal.low_limit <= data.tempextcal >= machineMonitor.alertSettings.tempextcal.high_limit
                    ? MachineMonitor.STATUS_OK
                    : MachineMonitor.STATUS_ERROR;
                var previousStatus = machineMonitor.statuses.tempextcal.status;

                if (currentStatus == previousStatus) {
                    // no change -- do nothing
                } else if (currentStatus == MachineMonitor.STATUS_OK && previousStatus == MachineMonitor.STATUS_ERROR) {
                    // machine returned back in range
                    machineMonitor.sendPostiveAlert(data.tempextcal);
                } else if (currentStatus == MachineMonitor.STATUS_ERROR && previousStatus == MachineMonitor.STATUS_OK) {
                    // machine left acceptable range
                    machineMonitor.sendNegativeAlert(data.tempextcal);
                } else if (currentStatus == MachineMonitor.STATUS_OK && previousStatus == MachineMonitor.STATUS_UNAVAILABLE) {
                    // first reading & positive -- do nothing
                } else if (currentStatus == MachineMonitor.STATUS_ERROR && previousStatus == MachineMonitor.STATUS_UNAVAILABLE) {
                    // first negative reading & negative -- send alert
                }

                MachineMonitor.statuses.tempextcal.lastReading = timestamp;
                MachineMonitor.statuses.tempextcal.status = currentStatus;

            } else {
                // TODO Improve handling of 401 AND 403 responses
                // console.error(error);
                console.error('Could not get machine info\n ^^^ ' + body.error + ': ' + uuid);
            }
        });


    }
}