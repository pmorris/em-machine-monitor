var moment = require('moment');

var emClient = require('./lib/elemental_machines_api');
var machineMonitor = require('./lib/machine_monitor');

function getEmApiParams() {
    return {
        'username': '',
        'password': ''
    }
};

function get_machines_config() {
    var machines = [
        { "name": "Element-T 1", "description": "-20 freezer", "location": "Room # 190", "uuid": "56ee6916-43ea-447b-9120-88158c300336" },
        { "name": "Element-T 2", "description": "Cryogenic freezer", "location": "Freezer Room", "uuid": "ea7e4847-0493-4a57-8645-8ec2fdc555df" },
        { "name": "Element-T 3", "description": "-80 freezer", "location": "Freezer Room, Back wall", "uuid": "00b81b5a-e09f-4b3a-8564-b165a9ccbb4b" },
        { "name": "Element-T 4", "description": "-80 freezer", "location": "Freezer room, closest to door", "uuid": "8092d98c-b92f-4343-a8ae-104f90362de8" }
    ];

    return machines;
}


function startMonitoring(machineMon) {

    function checkMachineHealth() {
        if (machineMon.isReady()) {

            // retrieve and process the machine samples
            machineMon.api.getMachineInfo(machineMon, function(data) {
                machineMon.logMachineSample(data);
                machineMon.processMachineSample(data);
            });

        } else {
            console.log('Machine not ready, skipping ' + machineMon.name + '; Retrying in ' + machineMon.getDelayInterval()/1000 + ' seconds');
        }
    }

    console.log('Preparing to request samples from machine: ' + machineMon.name + ', every interval: ' + machineMon.getDelayInterval()/100 + ' seconds');

    // @todo remove this - development only
    // checkMachineHealth();
    // return;

    // @todo remove delay override
    machineMon.setDelayInterval(5000);

    // start the machine health checks at the specified interval
    setInterval(checkMachineHealth, machineMon.getDelayInterval())

}



function main() {
    var machine_configs = get_machines_config();
    var machines = [];

    if (machine_configs.length) {
        var api = new emClient();

        // authenticate
        api.authenticate(getEmApiParams(), function() {

            for(i=0; i<machine_configs.length; i++) {
                console.log('setting up monitor #' + (i+1) + ' of ' + machine_configs.length);

                // setup machine monitoring options and supported monitiors
                machine_options = {
                    api: api,
                    monitors: {
                        tempextcal: true
                    }
                }

                var machineMon = new machineMonitor(machine_configs[i], machine_options)
                machines.push(machineMon);

                // retrieve the users for the machine
                machines[i].loadUsers(function() {

                    // retrieve the alert settings for the machine
                    machines[i].loadAlertSettingsSync(function() {

                        startMonitoring(machineMon);
                    });
                });

            }

        });

    }
}

if (require.main === module) {
    main();
}


