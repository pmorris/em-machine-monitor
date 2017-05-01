var MongoClient = require('mongodb').MongoClient;

class MachineMonitor {

    constructor(machine_attributies, options) {
        this.name = machine_attributies.name;
        this.description = machine_attributies.description;
        this.location = machine_attributies.location;
        this.uuid = machine_attributies.uuid;

        this.running = false;
        this.ready = {};

        this.statuses = {
            'tempextcal': {
                'status': MachineMonitor.STATUS_UNAVAILABLE,
                'lastReading': null,
                'lastReadingAt': null
            }
        };

        this.alertSettings = {};
        this.alertUsers = [];

        this.options = {
            'api': null,
            'interval': MachineMonitor.DEFAULT_INTERVAL,
        };
        this.monitors = {};

        // database client for logging sample readings
        // @TODO configure and connect to mongo database
        this.mongoDb = null;


        this.set_options(options);

    }

    set_options(options) {

        this.stop();

        if (options.api) {
            this.api = options.api;
        }

        if (options.check_func) {
            this.do_check = options.check_func;
        }

        this.monitors = options.monitors;

        // this.start();
        return this;
    }

    /**
     * Load AlertUsers using the API
     * @param  {Function} callback
     * @return {MachineMonitor}
     */
    loadUsers(callback) {
        this.ready.users = false;
        this.alertUsers = [];
        var self = this;
        var next = callback;
        this.api.loadUsers(this, function() {
            self.ready.users = true;
            if (next) {
                next();
            }
        })
        return this;
    }

    /**
     * Load AlertSettings using the API
     * @param  {Function} callback
     * @return {MachineMonitor}
     */
    loadAlertSettingsSync(callback) {
        this.ready.settings = false;
        this.alertSettings = {};
        var self = this;
        var next = callback;
        this.api.loadAlertSettings(this, function() {
            self.ready.settings = true;
            if (next) {
                next();
            }
        });
        return this;
    }

    /**
     * Add a single alert configuration to the monitor
     *
     * @param {string} type
     * @param {object} config Configuration data
     * @return {MachineMonitor}
     */
    addAlertSetting(type, config) {
        if (this.monitors[type]) {
            this.alertSettings[type] = config;
        }
        else {
            console.log('unable to add settings for type: ' + type);
        }
        return this;
    }

    /**
     * Set the interval
     * @param {int} interval Interval (in milliseconds)
     */
    setDelayInterval(interval) {
        this.options.interval = interval
    }

    getDelayInterval() {
        return this.options.interval;
    }

    start() {
        if (!this.is_running()) {
            this.do_check.machine_name = this.name,
            this.do_check.statuses = this.statuses;
            // this.intervalId = setInterval(function() {
            //         console.log(this)
            //         this.do_check
            //     },
            //     this.interval );

            this.intervalId = setInterval(function() {
                this.api.machines();
            })


            this.intervalId = setInterval(this.do_check, this.interval);
            var stop_me = this.stop;
            stop_me.interval_id = this.intervalId;
            setTimeout(stop_me, 3000);
        }
        return this;
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        // if (this.is_running()) {
        //     clearInterval(this.intervalId);
        //     this.intervalId = null;
        // }
        return this;
    }

    is_running() {
        return this.intervalId ? true : false;
    }

    isReady() {

        for (var property in this.ready) {
            if (this.ready.hasOwnProperty(property) && this.ready[property] == false) {
                return false;
            }
        }

        return true;
    }

    logMachineSample(data, callback) {
        if (this.mongoDb) {
            this.mongoDb.collection('sample_readings').insertOne({
                machine: {
                    name: this.name,
                    description: this.description,
                    location: this.location,
                    uuid: this.uuid
                },
                data: data
            }, function (error, result) {
                if (error) {
                    console.error('Unable to log sample data to MongoDB');
                }

                if (callback) {
                    callback();
                }
            });
        }
        return this;
    }

    logAlert(status, callback) {
        if (this.mongoDb) {

            this.mongoDb.collection('machine_alerts').insertOne({
                machine: {
                    name: this.name,
                    description: this.description,
                    location: this.location,
                    uuid: this.uuid
                },
                status: status
            }, function (error, result) {
                if (error) {
                    console.error('Unable to log sample data to MongoDB');
                }

                if (callback) {
                    callback();
                }
            });
        }
        return this;
    }

    processMachineSample(data) {

        if (data.sample_epoch <= this.statuses.tempextcal.lastReading) {
            // old sample -- ignore
            return;
        }

        var currentStatus = this.alertSettings.tempextcal.low_limit <= data.tempextcal >= this.alertSettings.tempextcal.high_limit
            ? MachineMonitor.STATUS_OK
            : MachineMonitor.STATUS_ERROR;
        var previousStatus = this.statuses.tempextcal.status;

        if (currentStatus == previousStatus) {
            // no change -- do nothing
        } else if (currentStatus == MachineMonitor.STATUS_OK && previousStatus == MachineMonitor.STATUS_ERROR) {
            // machine returned back in range
            this.sendPostiveAlert(data.tempextcal);
        } else if (currentStatus == MachineMonitor.STATUS_ERROR && previousStatus == MachineMonitor.STATUS_OK) {
            // machine left acceptable range
            this.sendNegativeAlert(data.tempextcal);
        } else if (currentStatus == MachineMonitor.STATUS_OK && previousStatus == MachineMonitor.STATUS_UNAVAILABLE) {
            // first reading & positive -- do nothing
        } else if (currentStatus == MachineMonitor.STATUS_ERROR && previousStatus == MachineMonitor.STATUS_UNAVAILABLE) {
            // first negative reading & negative -- send alert
            this.sendNegativeAlert(data.tempextcal);
        }

        // update the current status info
        this.statuses.tempextcal.lastReading = data.tempextcal;
        this.statuses.tempextcal.lastReadingAt = data.sample_epoch;
        this.statuses.tempextcal.status = currentStatus;
    }



    sendNegativeAlert() {
        this.logAlert(MachineMonitor.STATUS_ERROR);

        subject = 'Elemental Machines Monitoring Alert - Error';
        content = 'Machine temperature out of normal range: ' + this.name;

        this.sendEmailAlerts(content, subject);
        this.sentSmsAlerts(content);
    }

    sendPostiveAlert() {
        this.logAlert(MachineMonitor.STATUS_OK);

        subject = 'Elemental Machines Monitoring Alert - Normal';
        content = 'Machine temperature back within normal range: ' + this.name
        this.sendEmailAlerts(content, subject);
        this.sentSmsAlerts(content);

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

}

MachineMonitor.DEFAULT_TIMEOUT = 3600;

MachineMonitor.DEFAULT_INTERVAL = 3000;

MachineMonitor.STATUS_UNAVAILABLE = -1;
MachineMonitor.STATUS_OK = 0;
MachineMonitor.STATUS_ERROR = 1;


module.exports = MachineMonitor;