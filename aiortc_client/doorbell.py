#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Loop forever:
  1. Wait until keypress (to be replaced later by the pushbutton press event).
  2. Connect to the signaling server.
  3. Join a conference room with a random name (send 'create' signal with room name).
  4. Wait for response. If response is 'joined' or 'full', stop processing and return to the loop. Go on if response is 'created'.
  5. Send a message (SMS, Telegram, email, ...) to the user with the room name. Or simply start by printing it on the terminal. 
  6. Wait (with timeout) for a 'new_peer' message. If timeout, send 'bye' to signaling server and return to the loop. 
  7. Wait (with timeout) for an 'invite' message. If timemout, send 'bye to signaling server and return to the loop. 
  8. Acquire the media stream from the Webcam.
  9. Create the PeerConnection and add the streams from the local Webcam.
  10. Add the SDP from the 'invite' to the peer connection.
  11. Generate the local session description (answer) and send it as 'ok' to the signaling server.
  12. Wait (with timeout) for a 'bye' message. 
  13. Send a 'bye' message back and clean everything up (peerconnection, media, signaling).
"""

from contextlib import nullcontext
import os
import queue
import sys
import socketio
import asyncio
import aiohttp
import uuid

from aiortc import (
    RTCIceCandidate,
    RTCPeerConnection,
    RTCSessionDescription,
    VideoStreamTrack,
)
from aiortc.contrib.media import MediaBlackhole, MediaPlayer, MediaRecorder

sio = socketio.AsyncClient(ssl_verify=False)
pc = RTCPeerConnection()

async def main():
    while 1:
        global queue 
        queue = asyncio.Queue()
        print('press enter to ring the bell...')
        input() # Wait until keypress (to be replaced later by the pushbutton press event)

        # Connect to the signaling server
        await sio.connect('https://10.192.94.122:443')

        # Join a conference room with a random name
        # room_name =  uuid.uuid4()
        room_name =  'success4'
        await sio.emit('join', room_name) # create a random room
        # Wait for response
        message = await asyncio.wait_for(queue.get(), timeout=10)
        queue.task_done()
        event = message[0]
        data = message[1]
        
        # If response is 'joined' or 'full', stop processing and return to the loop
        if event != 'created':
            await sio.disconnect()
            break
        # print room name on the terminal
        print('Joined room : ' + data)

        # Wait for new_peer or invite
        try:
            message = await asyncio.wait_for(queue.get(), timeout=10)
        except asyncio.TimeoutError:
            await sio.emit('bye', room_name)
            break

        queue.task_done()
        event = message[0]
        data = message[1]

        if event != 'new_peer':
            await sio.disconnect()
            break

        # Prepare outgoing streams
        video_player = MediaPlayer('/dev/video0', format='v4l2', options={
            'video_size': '320x240'
        })
        audio_player = MediaPlayer("default", format="pulse")
        # Prepare incoming stream
        global recorder
        recorder = MediaRecorder('default', format='alsa')

        # Create the PeerConnection and add the streams from the local Webcam.
        pc.addTrack(audio_player)
        pc.addTrack(video_player)

        # Wait for the invite msg
        message = await asyncio.wait_for(queue.get(), timeout=10)
        queue.task_done()
        event = message[0]
        data = message[1]

        if event != 'invite':
            await sio.disconnect()
            break

        # Add the SDP from the 'invite' to the peer connection.
        pc.setRemoteDescription(data)
        # Generate the local session description (answer)
        answer = pc.createAnswer()
        pc.setLocalDescription(answer)
        # Only this SDP will contain the ICE candidates!
        response = pc.localDescription()
        # send it as 'ok' to the signaling server
        await sio.emit('ok', response)


        await sio.disconnect()

@pc.on("track")
def on_track(track):
    print("Receiving %s" % track.kind)
    recorder.addTrack(track)

@sio.on('*')
async def on_message(event, data):
    # add the message to the queue
    print('Add message ' + event + ' to the queue')
    queue.put_nowait([event, data])

asyncio.run(main())
