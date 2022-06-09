'use strict';

// ==========================================================================
// Global variables
// ==========================================================================
var peerConnection; // WebRTC PeerConnection
var room; // Room name: Caller and Callee have to join the same 'room'.
var socket; // Socket.io connection to the Web server for signaling.


// ==========================================================================
// 1. Make call
// ==========================================================================
call()

// --------------------------------------------------------------------------
// Function call, when call button is clicked.
async function call() {
    // Enable local microphone
    var localStream = await enable_mic();

    // Create Socket.io connection for signaling and add handlers
    // Then start signaling to join a room
    socket = create_signaling_connection();
    add_signaling_handlers(socket);
    call_room(socket);

    // Create peerConneciton and add handlers
    peerConnection = create_peerconnection(localStream);
    add_peerconnection_handlers(peerConnection);
}

// --------------------------------------------------------------------------
// Enable microphone
// use getUserMedia or displayMedia (share screen). 
// Then show it on localVideo.
async function enable_mic() {

    const constraints = { video: false, audio: true }

    console.log('Getting user media with constraints', constraints);

    try {
        var stream = await navigator.mediaDevices.getUserMedia(constraints)
    } catch (error) {
        // If we can not get the user media
        console.error("Unable to get UserMedia : " + error)
    }

    return stream;
}

// ==========================================================================
// 2. Signaling connection: create Socket.io connection and connect handlers
// ==========================================================================

// --------------------------------------------------------------------------
// Create a Socket.io connection with the Web server for signaling
function create_signaling_connection() {
    socket = io()
    return socket;
}

// --------------------------------------------------------------------------
// Connect the message handlers for Socket.io signaling messages
function add_signaling_handlers(socket) {
    // Event handlers for joining a room. Just print console messages
    // --------------------------------------------------------------

    socket.on('joined', (socket) => {
        handle_joined(socket)
    })

    socket.on('full', (socket) => {
        console.log('Room is full, try later.')
    })

    // Event handlers for call establishment signaling messages
    // --------------------------------------------------------
    // *** TODO ***: use the 'socket.on' method to create signaling message handlers:
    // new_peer --> handle_new_peer
    // invite --> handle_invite
    // ok --> handle_ok
    // ice_candidate --> handle_remote_icecandidate
    // bye --> hangUp
    socket.on('new_peer', (room) => {
        handle_new_peer(room)
    })

    socket.on('invite', (offer) => {
        handle_invite(offer)
    })

    socket.on('ok', (answer) => {
        handle_ok(answer)
    })

    socket.on('ice_candidate', (candidate) => {
        handle_remote_icecandidate(candidate)
    })

    socket.on('bye', () => {
        hangUp()
    })

}

// --------------------------------------------------------------------------
// Prompt user for room name then send a "join" event to server
function call_room(socket) {
    const queryString = window.location.search;
    const urlParam = new URLSearchParams(queryString);
    room = urlParam.get('roomId');
    if (room != '') {
        console.log('Joining room: ' + room);
        // *** TODO ***: send a join message to the server with room as argument.
        socket.emit('join', room);
    }
}

// ==========================================================================
// 3. PeerConnection creation
// ==========================================================================

// --------------------------------------------------------------------------
// Create a new RTCPeerConnection and connect local stream
function create_peerconnection(localStream) {
    const pcConfiguration = { 'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] }

    // *** TODO ***: create a new RTCPeerConnection with this configuration
    var pc = new RTCPeerConnection(pcConfiguration)

    // *** TODO ***: add all tracks of the local stream to the peerConnection
    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });

    return pc;
}

// --------------------------------------------------------------------------
// Set the event handlers on the peerConnection. 
// This function is called by the call function all on top of the file.
function add_peerconnection_handlers(peerConnection) {

    // *** TODO ***: add event handlers on the peerConnection
    // onicecandidate -> handle_local_icecandidate
    peerConnection.onicecandidate = (event) => {
        handle_local_icecandidate(event)
    }
    // ontrack -> handle_remote_track
    peerConnection.ontrack = (event) => {
        handle_remote_track(event)
    }
    // ondatachannel -> handle_remote_datachannel
    peerConnection.ondatachannel = (event) => {
        handle_remote_datachannel(event)
    }
}

// ==========================================================================
// 4. Signaling for peerConnection negotiation
// ==========================================================================


async function handle_joined(socket) {
    await peerConnection.createOffer();
    await peerConnection.setLocalDescription();
}


// --------------------------------------------------------------------------
// Handle new peer: another peer has joined the room. I am the Caller.
// Create SDP offer and send it to peer via the server.
async function handle_new_peer(room) {
    console.log('Peer has joined room: ' + room + '. I am the Caller.');

    // *** TODO ***: use createOffer (with await) generate an SDP offer for peerConnection
    const offer = await peerConnection.createOffer()
    // *** TODO ***: use setLocalDescription (with await) to add the offer to peerConnection
    await peerConnection.setLocalDescription(offer)
    // *** TODO ***: send an 'invite' message with the offer to the peer.
    socket.emit('invite', offer);
}

// --------------------------------------------------------------------------
// Caller has sent Invite with SDP offer. I am the Callee.
// Set remote description and send back an Ok answer.
async function handle_invite(offer) {
    console.log('Received Invite offer from Caller: ', offer);
    // *** TODO ***: use setRemoteDescription (with await) to add the offer SDP to peerConnection 
    await peerConnection.setRemoteDescription(offer)
    // *** TODO ***: use createAnswer (with await) to generate an answer SDP
    const answer = await peerConnection.createAnswer()
    // *** TODO ***: use setLocalDescription (with await) to add the answer SDP to peerConnection
    await peerConnection.setLocalDescription(answer)
    // *** TODO ***: send an 'ok' message with the answer to the peer.
    socket.emit('ok', answer);
}

// --------------------------------------------------------------------------
// Callee has sent Ok answer. I am the Caller.
// Set remote description.
async function handle_ok(answer) {
    console.log('Received OK answer from Callee: ', answer);
    // *** TODO ***: use setRemoteDescription (with await) to add the answer SDP 
    //               the peerConnection
    await peerConnection.setRemoteDescription(answer)
}

// ==========================================================================
// 5. ICE negotiation and remote stream handling
// ==========================================================================

// --------------------------------------------------------------------------
// A local ICE candidate has been created by the peerConnection.
// Send it to the peer via the server.
async function handle_local_icecandidate(event) {
    console.log('Received local ICE candidate: ', event);
    // *** TODO ***: check if there is a new ICE candidate.
    // *** TODO ***: if yes, send a 'ice_candidate' message with the candidate to the peer
    if (event.candidate == null){
        const offerSDP = peerConnection.localDescription
        socket.emit('invite', offerSDP);
    }
}

// --------------------------------------------------------------------------
// The peer has sent a remote ICE candidate. Add it to the PeerConnection.
async function handle_remote_icecandidate(candidate) {
    console.log('Received remote ICE candidate: ', candidate);
    // *** TODO ***: add the received remote ICE candidate to the peerConnection 
    peerConnection.addIceCandidate(candidate)
}

// ==========================================================================
// 6. Function to handle remote video stream
// ==========================================================================

// --------------------------------------------------------------------------
// A remote track event has been received on the peerConnection.
// Show the remote track video on the web page.
function handle_remote_track(event) {
    console.log('Received remote track: ', event);
    // *** TODO ***: get the first stream of the event and show it in remoteVideo
    document.getElementById('remoteVideo').srcObject = event.streams[0]
}

// ==========================================================================
// 8. Functions to end call
// ==========================================================================

// --------------------------------------------------------------------------
// HangUp: Send a bye message to peer and close all connections and streams.
function hangUp() {
    // *** TODO ***: Write a console log
    console.log('Terminating connection...')
    // *** TODO ***: send a bye message with the room name to the server
    socket.emit('bye', room)
    // Switch off the local stream by stopping all tracks of the local stream
    var localVideo = document.getElementById('localVideo')
    var remoteVideo = document.getElementById('remoteVideo')
    // *** TODO ***: remove the tracks from localVideo and remoteVideo
    localVideo.srcObject.getTracks().forEach(track => track.stop())
    remoteVideo.srcObject.getTracks().forEach(track => track.stop())
    // *** TODO ***: set localVideo and remoteVideo source objects to null
    localVideo = null
    remoteVideo = null
    // *** TODO ***: close the peerConnection and set it to null
    peerConnection.close()
    peerConnection = null
    // *** TODO ***: close the dataChannel and set it to null
    document.getElementById('dataChannelOutput').value += '*** Channel is closed ***\n';
}

// --------------------------------------------------------------------------
// Clean-up: hang up before unloading the window
window.onbeforeunload = function (e) {
    hangUp();
}
