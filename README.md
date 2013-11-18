charlie.js
===========

A small framework for synchronizing video and CSS3 animations.

You can see a live demo here (watch on a laptop/desktop and give it
at least 30 seconds to really see how it works):
http://www.sketchingwithcss.com/flexbox/


Create your CSS3 animations with the naming convention
--------------------------------------------------

The animation properties should be defined with a class selector that
matches the name of the corresponding keyframe.

.grow {
	animation-name: grow;
	animation-duration: 4s;
	animation-timing-function: linear;
	animation-iteration-count: 1;
	animation-direction: normal;
    animation-fill-mode: forwards;
}

@keyframes grow {
   0% {
       width: 5px;
       height: 5px;
   }

   100% {
       width: 50px;
       height: 50px;
   }
}

Notice the class name matches the animation-name matches the keyframes
name.

Add the "charlie" class, data-animations and data-times
-----------------------------------------------------

In your markup add a 'charlie' class to any element that you will
animate. Then add two data attributes: data-animations and data-times.

- data-animations - A comma separated list of the animation names that
  will run on this element. The names should be the same as the
  class/keyframe combo in your stylesheet.

- data-times - A comma separated list of times when the animations
  will run. These times are synced with the video. There must be one
  time for every animation. Times are in seconds with a resolution to
  a tenth of a second.

e.g.

<div class="charlie" data-animations="grow, shrink" data-times="40.2, 90.3">
</div>

Include the right javascript
----------------------------------------

Within the demo directory of this project is a charlie.js which
contains charlie.js plus all of its dependencies. You can use this
version if you want. Or you can include charlie.js and it's
dependencies individually.

You must include underscore.js and the polyfills.js file in this
repository.


Make the CHARLIE.setup(video) call
------------------------------
Somewhere in your javascript get a reference to the video element you
will sync with the animations. Then call CHARLIE.setup.

CHARLIE.setup(video);


Include Javascript callbacks with CHARLIE.addCallback
------------------------------

For fancier and more complicated use cases you will need more than
just CSS3 animations. There will be other state on your page you need
to maintain, so you can add Javascript callbacks at arbitrary times.

CHARLIE.addCallback(function(){
    // do stuff in here
}, 43.2);

Charlie.js does a pretty good job of maintaining animation state and
keeping everything in sync as you jump around a video, but this is not
the case with your Javascript callbacks.

As of now, if you add a bunch of callbacks that affect the state of
the page, you will have to manually handle keeping the state in sync if a user starts jumping
around in the video.

So you will need to add event listeners to the video by
hand. Eventually, Charlie.js might add some better mechanisms to help,
but you're on your own for now.

Gotchas
---------

- There is a bug in Chrome where the cssRules property on a stylesheet
  is null if you load the stylesheet using the file: protocol. So
  you'll have to serve up the demo, you can't just open the file.
  
- Does not respond to framerate changes. So if the video stutters or
  you want to slow down the rate of the video, the animations will be
  out of sync.
  
   
