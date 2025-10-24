function clearLogClick() {
    document.getElementById('log').innerText = "";
}

function connectClick() {
    let button = document.getElementById('connect');
    let icon = document.getElementById('connect_icon');
    let text = document.getElementById('connect_text');

    button.removeEventListener('click', connectClick);

    button.classList.add('w3-disabled');
    icon.classList.add('fa-spin');
    icon.classList.add('fa-circle-notch');
    icon.classList.remove('fa-link');
    text.innerHTML = 'Connecting...';

    connect().then(r => {
        configBtnDisconnect(button, icon, text, r);
    }, error => {
        let log = document.getElementById('log');
        log.innerText += error + "\n";
        console.log(error);
        configBtnConnect(button, icon, text);
    })
}

function configBtnConnect(button, icon, text) {
    button.addEventListener('click', connectClick);
    button.classList.remove('w3-disabled');
    button.classList.add('w3-green');
    button.classList.remove('w3-orange');
    icon.classList.remove('fa-spin');
    icon.classList.remove('fa-circle-notch');
    icon.classList.add('fa-link');
    icon.classList.remove('fa-link-slash');
    text.innerHTML = 'Connect';

    let unicast_address_select = document.getElementById('unicast_address');
    unicast_address_select.classList.add('w3-disabled');

    for (let i = 0; i < 16; i++) {
        let checkbox = document.getElementById('multicast_mask_' + ('00' + i.toString(16).toUpperCase()).slice(-2));
        checkbox.classList.add('w3-disabled');
    }
}

function configBtnDisconnect(button, icon, text, server) {
    button.addEventListener('click', disconnectClickFn(server));
    button.classList.remove('w3-disabled');
    button.classList.remove('w3-green');
    button.classList.add('w3-orange');
    icon.classList.remove('fa-spin');
    icon.classList.remove('fa-circle-notch');
    icon.classList.add('fa-link-slash');
    text.innerHTML = 'Disconnect';

    let unicast_address_select = document.getElementById('unicast_address');
    unicast_address_select.classList.remove('w3-disabled');
    unicast_address_select.addEventListener('change', async (e) => {
        let service = await server.getPrimaryService("c902d400-1809-2a94-904d-af5cbdcefe9b");
        let unicast_characteristic = await service.getCharacteristic(0xFF04);

        let data_view = new DataView(new ArrayBuffer(1));
        data_view.setUint8(0, parseInt(e.target.value));

        await unicast_characteristic.writeValueWithoutResponse(data_view);
    })
}

function disconnectClickFn(server) {
    return (event) => {
        let button = document.getElementById('connect');
        let icon = document.getElementById('connect_icon');
        let text = document.getElementById('connect_text');

        let team_id_span = document.getElementById('team_name');
        let car_id_span = document.getElementById('car_id');

        team_id_span.innerHTML = "";
        car_id_span.innerHTML = "";

        button.classList.add('w3-disabled');
        icon.classList.add('fa-spin');
        icon.classList.add('fa-circle-notch');
        icon.classList.remove('fa-link');
        text.innerHTML = 'Disconnecting...';

        disconnect(server).then(_ => {
            console.log('Disconnected from device');
            configBtnConnect(button, icon, text);
        }, error => {
            console.log(error);
            configBtnConnect(button, icon, text);
        });
    }
}

async function disconnect(server) {
    await server.disconnect();
}

async function connect() {
    if (navigator.bluetooth === undefined) {
        return Promise.reject("navigator.bluetooth is undefined. Try using a Chromium-based browser and make sure the site is served using HTTPS!");
    }

    let device = await navigator.bluetooth.requestDevice({filters: [{services: ['c902d400-1809-2a94-904d-af5cbdcefe9b']}]});
    let server = await device.gatt.connect();

    let service = await server.getPrimaryService("c902d400-1809-2a94-904d-af5cbdcefe9b");

    log.innerText += 'Device connected, loading details...';

    let team_characteristic = await service.getCharacteristic(0xFF01);
    let car_id_characteristic = await service.getCharacteristic(0xFF02);
    let ir_nec_characteristic = await service.getCharacteristic(0xFF03);
    let unicast_characteristic = await service.getCharacteristic(0xFF04);
    let multicast_characteristic = await service.getCharacteristic(0xFF05);

    log.innerText += 'OK\n';

    let team_id = fromCString(await team_characteristic.readValue());
    let team_id_span = document.getElementById('team_name');
    team_id_span.innerHTML = team_id;

    let car_id = fromCString(await car_id_characteristic.readValue());
    let car_id_span = document.getElementById('car_id');
    car_id_span.innerHTML = car_id;

    let unicast_address = (await unicast_characteristic.readValue()).getUint8(0);
    let unicast_address_select = document.getElementById('unicast_address');
    unicast_address_select.value = unicast_address.toString();
    unicast_address_select.classList.remove('w3-disabled');

    let multicast_mask = (await multicast_characteristic.readValue());
    for (let i = 0; i < 8; i++) {
        let id = 'multicast_mask_' + ('00' + i.toString(16).toUpperCase()).slice(-2);
        let checkbox = document.getElementById(id);
        checkbox.checked = (multicast_mask.getUint8(0) & (1 << i)) === (1 << i);
        checkbox.classList.remove('w3-disabled');

        checkbox.addEventListener('change', async (e) => {
            let value = multicast_characteristic.value;
            if (e.target.checked) {
                value.setUint8(0, value.getUint8(0) | (1 << i));
            } else {
                value.setUint8(0, value.getUint8(0) & ~(1 << i));
            }
            await multicast_characteristic.writeValueWithResponse(value);
        })
    }
    for (let i = 0; i < 8; i++) {
        let id = 'multicast_mask_' + ('00' + (i + 8).toString(16).toUpperCase()).slice(-2);
        let checkbox = document.getElementById(id);
        checkbox.checked = (multicast_mask.getUint8(1) & (1 << i)) === (1 << i);
        checkbox.classList.remove('w3-disabled');

        checkbox.addEventListener('change', async (e) => {
            let value = multicast_characteristic.value;
            if (e.target.checked) {
                value.setUint8(1, value.getUint8(1) | (1 << i));
            } else {
                value.setUint8(1, value.getUint8(1) & ~(1 << i));
            }
            await multicast_characteristic.writeValueWithResponse(value);
        })
    }

    let subscribed_characteristic = await ir_nec_characteristic.startNotifications();
    subscribed_characteristic.addEventListener('characteristicvaluechanged', value => {
        const data = value.target.value;
        const address = data.getUint16(0);
        const command = data.getUint16(2);

        const log = document.getElementById('log');
        log.innerText += 'Address: ' + ('0000' + address.toString(16)).slice(-4) + ', Command: ' + ('0000' + command.toString(16)).slice(-4) + '\n';
    });

    device.addEventListener('gattserverdisconnected', _ => {
        let button = document.getElementById('connect');
        let icon = document.getElementById('connect_icon');
        let text = document.getElementById('connect_text');
        let log = document.getElementById('log');

        log.innerText += 'Device disconnected\n';

        let team_id_span = document.getElementById('team_name');
        let car_id_span = document.getElementById('car_id');

        team_id_span.innerHTML = "";
        car_id_span.innerHTML = "";

        configBtnConnect(button, icon, text);
    })

    return server;
}

function fromCString(data_view) {
    const utf8decoder = new TextDecoder();
    if (data_view.getUint8(data_view.byteLength - 1) === 0) {
        data_view = new DataView(data_view.buffer, 0, data_view.byteLength - 1);
    }
    return utf8decoder.decode(data_view);
}

document.addEventListener("DOMContentLoaded", function () {
    document.getElementById('clear_log').addEventListener('click', clearLogClick);
    document.getElementById('connect').addEventListener('click', connectClick);

    let select = document.getElementById('unicast_address');
    for (let i = 16; i < 255; i++) {
        select.insertAdjacentHTML('beforeend', "<option value='" + i + "'>0x" + ('00' + i.toString(16)).slice(-2) + "</option>");
    }
});
