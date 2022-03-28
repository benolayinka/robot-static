import { getQuery } from './utils.js'
import JanusAsyncHelper from './janus-async-helper.js'

const hello = document.getElementById("hello");
const name = document.getElementById("name");
const stream = document.getElementById("stream");
const goodbye = document.getElementById("goodbye");
const form = document.getElementById("form")
const inputName = document.getElementById("inputName")
const startButton = document.getElementById("startButton")
const requestButton = document.getElementById("requestButton")
const video = document.getElementById("video")
const hud = document.getElementById("hud")
const usersButton = document.getElementById("usersButton")
const userList = document.getElementById("userList")
var userListElements = document.getElementById("userListElements")

hello.style.display = "block"
name.style.display = "none"
goodbye.style.display = "none"
stream.style.display = "none"

function onHelloClick() {
	hello.style.display = "none"
	name.style.display = "block"
}

hello.addEventListener("click", onHelloClick, false);

function onStartButtonClick(event) {
    event.preventDefault()

	const nameString = inputName.value
	if(!nameString || nameString === '') {
        alert("what's your name?");
        return
    }
    else {
    	name.style.display = "none"
		stream.style.display = "block"
        state.name = nameString
    }
    console.log(state)
}

form.addEventListener('submit', onStartButtonClick)

startButton.addEventListener("click", onStartButtonClick, false)

requestButton.addEventListener("click", onRequestButton, false);

usersButton.addEventListener("click", onUsersButton, false);


const controlStates = {
    AVAILABLE: 'available',
    REQUESTING: 'requesting',
    UNAVAILABLE: 'unavailable',
    HAVE: 'have' 
}

const controlTexts = {
    AVAILABLE: 'Touch me to drive for 30 seconds!',
    REQUESTING: 'Requesting',
    UNAVAILABLE: 'Unavailable',
	HAVE: 'Ok!', 
}

const hudText = (user, state, timeLeft) => {
    var name
    if(user) name = user.name
    else name = 'Nobody'

    switch(state) {
        case controlStates.AVAILABLE:
            return 'Nobody is driving'
            break;
        case controlStates.REQUESTING:
            return 'Requesting...'
            break;
        case controlStates.UNAVAILABLE:
        case controlStates.HAVE:
            return name + ' is driving. ' + timeLeft + ' seconds left.'
            break;
        default:
            return 'Nobody is driving'
            break;
    }
}

var streamingPluginHandle = null

var _state = {
    nipple: null,
    streamId: null,
    uuid: null,
    name: null,
    rover: null,
    controlLoopRunning: false,
    gamepadData: {
            driveJoystickData: {x:0, y:0},
            lookJoystickData: {x:0, y:0},
            buttonsPressed: {0:false, 1:false, 2:false},
            keysPressed: {},
        },
    remoteStream: null,
    remoteStreamDisconnected: false,
    haveRover: false,
    controlState:controlStates.AVAILABLE,
	controlText:controlTexts.AVAILABLE,
	usersInRoom: null,
	activeUserInRoom: null,
    showModal: false,
    timeLeft: null,
    showUsers: false,
    showEndTimer: false,
    showDriveTooltip: true,
    controlLoop: null,
}

var state = new Proxy(_state, {
    set: function (target, key, value) {

        console.log(`State: ${key} set to ${value}`);

        const oldValue = target[key]

        target[key] = value;

        if(key==="usersInRoom" || key==="activeUserInRoom"){
            if(oldValue !== target[key]) updateUserList()
        }

        if(key==="showUsers"){
            value ? userList.style.display = "block" : userList.style.display = "none"
        }

        if(key==="rover" || key==="name"){
            openSocket()
        }

        if(key==="remoteStream"){
            video.setAttribute("src", value)
            video.addEventListener("playing", ()=>console.log("Video playing!"))
        }

        if(key==="remoteStreamDisconnected" && value===true){
        // Wait for reconnect, then error out
            setTimeout(()=>{
                if(state.remoteStreamDisconnected){
                    state.haveRemoteStream = false
                }
            }, 1000)
        }

        if(key==="controlText"){
            requestButton.textContent = value
            hud.textContent = hudText(state.activeUserInRoom, state.controlState, state.timeLeft)
        }

        if(key==="timeLeft"){
            hud.textContent = hudText(state.activeUserInRoom, state.controlState, state.timeLeft)
        }

        if(key==="controlState"){
            switch(value) {
            case controlStates.HAVE:
                addNipple()
                hideRequestButton()
                break
            case controlStates.UNAVAILABLE:
                removeNipple()
                hideRequestButton()
                break
            case controlStates.AVAILABLE:
                removeNipple()
                showRequestButton()
                break
            default:
                // code block
            }
        }

        return true;
  }
});

function onMessageCallback(msg, jsep) {
	var result = msg["result"];
    if(result !== null && result !== undefined) {
        if(result["status"] !== undefined && result["status"] !== null) {
            var status = result["status"];
            if(status === 'starting')
                console.log('StreamView OnMessage Starting')
            else if(status === 'started')
                console.log('StreamView OnMessage Started')
            else if(status === 'stopped')
                console.log('StreamView OnMessage Stopped')
        }
    }
    if(jsep !== undefined && jsep !== null) {
        streamingPluginHandle.createAnswer(
            {
                jsep: jsep,
                media: { audioSend: false, videoSend: false, data: true },
                success: (jsep)=> {
                    var body = { "request": "start" };
                    streamingPluginHandle.send({"message": body, "jsep": jsep});
                },
                error: (error) => {
                    console.error("WebRTC error:", error);
                }
            });
    }
}

function onRemoteStreamCallback(stream) {
	console.debug('StreamView OnRemoteStreamCallback', stream)
    var videoTracks = stream.getVideoTracks();
    if(videoTracks === null || videoTracks === undefined || videoTracks.length === 0) {
        console.debug('StreamView OnRemoteStreamCallback No Remote Video Track Found')
        // No remote video
        state.remoteStreamDisconnected = true
    } else {
        console.debug('StreamView OnRemoteStreamCallback Remote Video Track Found')
        state.remoteStream = window.URL.createObjectURL(stream)
        state.remoteStreamDisconnected = false

        //video resizes window, so render stuff after
        //this.videoRef.current.addEventListener("playing",
        //     ()=> { this.setState({remoteStreamPlaying:true}) }, true);
    }
}

async function watchStream() {
    let body = {
        request: 'watch',
        id: state.streamId
    }
    var response = await janusAsyncHelper.sendMessage('janus.plugin.streaming', body)
}

async function stopStream() {
    let body = { "request": "stop" };
    let response = await janusAsyncHelper.sendMessage('janus.plugin.streaming', body)
}

async function getRoverFromStream() {  	
    let body = {
        request: 'info',
        id: state.streamId
    }
    var response = await janusAsyncHelper.sendMessage('janus.plugin.streaming', body)
    if(!response.info) {
        console.error('no stream', response)
        return
    }
    state.rover = response.info.description
}

function closeConnection() {
    clearInterval(state.controlLoop)
    state.controlLoopRunning=false
    state.socket.close()
}

function updateUsersByRooms(usersByRooms){
    //get users just in our room
    console.log('users', usersByRooms)
    state.usersInRoom = usersByRooms[state.rover]
}

function handleRequestAck(message){
    if(message.uuid === state.uuid) {
        if(message.requestGranted){
            state.controlState = controlStates.HAVE
            state.controlText = controlTexts.HAVE
        } else {
            state.controlState = controlStates.UNAVAILABLE
        }
    }
}

function handleSecondsRemaining(message){
    //get the index of the active user from the uuid of the seconds message
    let userIndex = state.usersInRoom.map(function(user) { return user.uuid; })
                .indexOf(message.uuid);

    //set activeuser if found
    if (userIndex >= 0) {
            let user = state.usersInRoom[userIndex]
            state.activeUserInRoom = user
    }

    //update state based on who is using
    if(message.uuid === state.uuid) {
        state.controlState = controlStates.HAVE
    } else {
        state.controlState = controlStates.UNAVAILABLE
    }

    //update control text
    state.timeLeft = message.secondsRemaining

    if(message.secondsRemaining <= 3 && message.secondsRemaining >= 1){
        state.showEndTimer = true
    } else {
        state.showEndTimer = false
    }

    //update state when time expires
    if(message.secondsRemaining === 0){
        state.controlText = controlTexts.AVAILABLE
        state.controlState = controlStates.AVAILABLE
        state.activeUserInRoom = null
    }
}

function handleAvailable(){
    state.controlText = controlTexts.AVAILABLE
    state.controlState = controlStates.AVAILABLE
    state.activeUserInRoom = null
}

function onSocketConnect(){
    state.socket.on('users by rooms', (usersByRooms) => updateUsersByRooms(usersByRooms))

    state.socket.on('message', (message)=> {
        console.log('message received', message)
        switch(message.type) {
            case 'request ack':
                handleRequestAck(message)
                break
            case 'seconds remaining':
                handleSecondsRemaining(message)
                break
            case 'available':
                handleAvailable()
                break
            default:
                // code block
            }
    })

    //defining and using all program logic within connected context..
    function sendControls(){
        state.socket.emit('message', {
            type: 'controls',
            data: state.gamepadData,
            uuid: state.uuid
        })
    }

    function controlLoopFunc(){
        if (state.controlState !== controlStates.UNAVAILABLE) {
            sendControls()
        }
    }

    // Send control updates to the server every .1 seconds.
    state.controlLoop = setInterval(controlLoopFunc, 100)

    state.socket.emit('user connected', {
            name: state.name,
            uuid: state.uuid,
        })

    //join room for rover
    state.socket.emit('join', state.rover, (response)=>{
        console.log('join room response: ' + response)
    })
}

function onRequestButton(){
    state.controlText = controlTexts.REQUESTING
    state.controlState = controlStates.REQUESTING
    //also need to check for user, give request an id
    state.socket.emit('message', {
        type: 'request',
        uuid: state.uuid,
    })

    //if we don't get an ack, become available again after 5 seconds
    setTimeout(()=>{
        if(state.controlState === controlStates.REQUESTING){
            handleAvailable()
        }
    }, 5000)
}

function onUsersButton(){
    state.showUsers = !state.showUsers
}


function openSocket(){
    if(state.name && state.rover){
        state.socket = io("https://goodrobot.live")
        state.socket.on('connect', onSocketConnect);
    }
}

function getUsefulJoystickData(evt, data){
    if(evt.type === 'move'){
        let size = data.instance.options.size
        let centerX = data.instance.position.x
        let centerY = data.instance.position.y

        //scale both axes to plus minus 90 degrees
        let normalX = Math.trunc( 180 * (data.position.x - centerX) / size)
        //y axis is flipped, up is negative
        let normalY = Math.trunc (-180 * (data.position.y - centerY) / size)
        return {x:normalX, y:normalY}
    } else if (evt.type === 'end') {
        return {x:0, y:0}
    }
}

function handleDriveJoystick(event, data){
    handleJoystick('driveJoystick', event, data)
}

function handleJoystick(joystick, event, data){
    let evt = joystick
    let dat = getUsefulJoystickData(event, data)
    handleEvent(evt, dat)
}

function handleEvent(event, data){
    onGamepadEvent(event, data)
}

function onGamepadEvent(evt, data){
	if(evt === 'driveJoystick'){
	    state.gamepadData.driveJoystickData = data
	}
	else if(evt === 'lookJoystick'){
	    state.gamepadData.lookJoystickData = data
	}
	else if(evt === 'button'){
	    state.gamepadData.buttonsPressed[data.button] = data.pressed
	}
	else if(evt === 'mouse'){

	}
	else if(evt === 'key'){
	    state.gamepadData.keysPressed[data.key] = data.pressed
	}
}

function updateUserList(){
    const ul = document.createElement("ul")
    state.usersInRoom.forEach(function generate(user) {
        const li = document.createElement("li")
        ul.appendChild(li)
        if(state.activeUserInRoom && state.activeUserInRoom.uuid === user.uuid) {
            li.textContent = user.name + " - driving!"
        } else {
        li.textContent = user.name
        }
    })
    userListElements.replaceWith(ul)
    userListElements = ul
}

function showRequestButton(){
    requestButton.style.display = "inline-block"
}

function hideRequestButton(){
    requestButton.style.display = "none"
}

function addNipple(){
    if(state.nipple) return
    state.nipple = nipplejs.create({
        zone: document.getElementById('nipple'),
        mode: 'static',
        position: {left: '50%', top: '50%'},
        color: 'transparent',
        //size: nippleSize,
        restOpacity: 1,
        fadeTime: 0,
    });
    state.nipple.on('move end', handleDriveJoystick);
    console.log(state.nipple)
}

function removeNipple(){
    if(!state.nipple) return
    state.nipple.destroy()
    state.nipple = null
}

async function init(){
    await janusAsyncHelper.init('https://goodrobot.live/janusbase/janus')
    streamingPluginHandle = await janusAsyncHelper.attachPlugin('janus.plugin.streaming')
    janusAsyncHelper.attachCallback('janus.plugin.streaming', 'onmessage', onMessageCallback)
    janusAsyncHelper.attachCallback('janus.plugin.streaming', 'onremotestream', onRemoteStreamCallback)
    getRoverFromStream()
    watchStream()
}

// initialize

var janusAsyncHelper = new JanusAsyncHelper()

const query = getQuery();
const debug = 'debug' in query

if(debug){
	state.uuid = 'debug'
    state.name = "debug"
    state.rover = "debug"
    state.user = {name: name, uuid: uuid}
}
else
	state.uuid = uuidv4();

state.streamId = parseInt(query.id) || 4 

init()