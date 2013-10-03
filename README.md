charlie.js
===========

A small framework for synchronizing video and CSS3 animations.

Gotchas
---------

- There is a bug in Chrome where the cssRules property on a stylesheet
  is null if you load the stylesheet using the file: protocol. So
  you'll have to serve up the demo, you can't just open the file.
  
- Does not respond to framerate changes. So if the video stutters or
  you want to slow down the rate of the video, the animations will be
  out of sync.
  
   
