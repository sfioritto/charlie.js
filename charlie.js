(function(){

    /* 
     * requires: dataset, classlist, getElementsByClassName
     */
 
    window.CHARLIE = {};
    var CHARLIE = window.CHARLIE;


    /************************************************************************
     * Constants
     */
    var KEYFRAMES_RULE = window.CSSRule.KEYFRAMES_RULE
        || window.CSSRule.WEBKIT_KEYFRAMES_RULE
        || window.CSSRule.MOZ_KEYFRAMES_RULE
        || window.CSSRule.O_KEYFRAMES_RULE
        || window.CSSRule.MS_KEYFRAMES_RULE,

    PREFIXES = ["webkit", "moz", "o", "ms"];


    /************************************************************************
     * Helper Functions
     */
    var scrapeAnimationData = function() {

        /* Grab the data from the DOM. */
        var data = {};
        _.forEach(
            //loop through every element that should be animated
            document.getElementsByClassName("charlie"),
            
            //for each element, pull off the info from the dataset
            function(element) {

                /*
                 * Creates an object of animation name: time, e.g.
                 * 
                 * { swoopy: [ 
                 *    { element: domElement,
                 *      time: 6522 },
                 *    { element: anotherElement,
                 *      time: 7834 }]
                 * }
                 */

                //
                var names = element.dataset.animations.split(/\s*,\s*/),
                times = element.dataset.times.split(/\s*,\s*/),
                
                // creates an array of arrays, each one called a 'tuple'
                // basically ties the time to the 
                // animation name, so it looks like:
                //[["zippy", 1], ["fade", 2] ... ]
                tuples = _.zip(names, times);
                
                /*
                * turn the tuples into an object, 
                * which is just a little easier to work with.
                * We end up with an object that looks like:
                * {
                *  fade: [ {element: domElement, time: "1.2s"}, ... ],
                *  fling: [ {element: domelement, time: "2.4s"}, ... ]
                * }
                * So we can reuse an animation on different elements
                * at different times.
                */
                
                _.forEach(tuples, function(tuple){
                    var name = tuple[0],
                    time = tuple[1];
                    data[name] = data[name] || [];
                    data[name].push({
                        element: element,
                        time: time
                    })
                });
            });
        return data;
    },


    /* 
       iterate through every stylesheet and create a list of rules
       that matches the passed in matcher function
    */
    findRules = function(matches){
        var styleSheets = _.toArray(document.styleSheets),
        rules = [];

        _.forEach(styleSheets, function(sheet){
            var cssRules = [];
            try {
                cssRules = _.toArray(sheet.cssRules);
            } catch (e) {
                //cross domain exception
            }
            _.forEach(cssRules, function(rule){
                if (matches(rule)){
                    rules.push(rule);
                }
            });
        });
        return rules;
    },

    roundTime = function(time) {
        //round a time to one tenth of a second
        //return time.toFixed(1);
        return Math.round(time * 10) / 10;
    },

    animationName = (function(){
        var name = "";
        return function(style){
            if (name) {
                return name;
            } else {
                if (style.animationName) {
                    name = "animationName";
                } else if (style.webkitAnimationName) {
                    name = "webkitAnimationName";
                } else if (style.mozAnimationName) {
                    name = "mozAnimationName";
                } else if (style.oAnimationName) {
                    name="oAnimationName";
                } else if (style.msAnimationName) {
                    name = "msAnimationName";
                } else {
                    name = "";
                }
                return name;
            }
        }
    })(),

    prefixed = function(prop){

        var props = _.map(PREFIXES, function(prefix){
            return prefix + prop.substring(0, 1).toUpperCase() + prop.substring(1);
        });
        props.push(prop);
        return props;
    },

    animationDuration = (function(){
        
        var durationName = "",
        props = prefixed("animationDuration");
        
        return function(style){
            if (!durationName){
                for (var i = 0; i < props.length; i++){
                    var prop = props[i];
                    if (style[prop]){
                        durationName = prop;
                        break;
                    }
                }
            }
            return style[durationName];
        };
    })(),

    calculatedDuration = function(style){
        /* NOTE: could support multiple iterations, but 
         * only the same duration for each iteration.
         * TODO: support iterations
         */
        var duration = animationDuration(style);
        duration = Number(duration.substring(0, duration.length -1));
        
        return duration || 0;
    },

    onAnimationEnd = function(element, callback) {
        element.addEventListener("webkitAnimationEnd", callback, false);
        element.addEventListener("mozAnimationEnd", callback, false);
        element.addEventListener("msAnimationEnd", callback, false);
        element.addEventListener("oAnimationEnd", callback, false);
        element.addEventListener("animationend", callback, false);
    },

    setDelay = function(animation, seconds) {
        var delay = -(seconds - animation.startsAt),
        delay = delay < 0 ? delay : 0,
        milliseconds = Math.floor(delay * 1000) + "ms";

        animation.element.style.webkitAnimationDelay = milliseconds;
        animation.element.style.mozAnimationDelay = milliseconds;
        animation.element.style.oAnimationDelay = milliseconds;
        animation.element.style.msAnimationDelay = milliseconds;
        animation.element.style.animationDelay = milliseconds;
    };



    


    /************************************************************************
     * CSSAnimations
     * 
     * Basically a bucket for holding keyframes and stylesheet rules
     * for animations.
     */

    var CSSAnimations = function(keyframes, cssRules){
        this.keyframes = keyframes;
        this.cssRules = cssRules;
    };

    CSSAnimations.create = function(){
        /* create keyframe lookup */
        var keyframeRules = findRules(function(rule){
            return KEYFRAMES_RULE === rule.type;
        }),
        keyframes = 
            _.object(
                _.map(
                    keyframeRules, 
                    function(rule){ return [rule.name, rule]; }));
        
        /* create animation styles lookup */
        var animationStyleRules = findRules(function(rule){
            return rule.style && rule.style[animationName(rule.style)];
        }),
        cssRules = 
            _.object(
                _.map(
                    animationStyleRules,
                    function(style){ return [style.selectorText.substring(1), style]; }));

        return new CSSAnimations(keyframes, cssRules);
    };
    
    CSSAnimations.prototype = {
        keyframes : {},
        cssRules: {},
    };
    CHARLIE.CSSAnimations = CSSAnimations;


    /************************************************************************
     * Animation Controller 
     */

    var AnimationController = function(animations, bySeconds, timeModel, callbacks){
        this.animations = animations || {};
        this.bySeconds = bySeconds || {};
        this.running = [];
        this.paused = [];
        this.timeModel = timeModel || {};
        this.callbacks = callbacks || {};
    };

    AnimationController.prototype = {

        animations: {},
        bySeconds: {},
        running: [],
        paused: [],
        timeModel: {},
        callbacks: {},

        startAnimations: function(time, videoTime){

            // allow precision to one tenth of a second
            var seconds = roundTime(videoTime),
            me = this;

            //resume any paused animations
            me.resumeAnimations();

            /* start up any animations that should be running at this second.
             * Don't start any that are already running
             */
            if (me.bySeconds[seconds]){
                var animations = me.bySeconds[seconds],
                notRunning = _.filter(animations, function(animation){
                    return !_.contains(me.running, animation);
                });
                
                /* requestAnimationFrame happens more than 
                 *  every tenth of a second, so this code will run
                 *  multiple times for each animation starting time
                 */
                _.forEach(notRunning, function(animation){
                    animation.start();
                    me.running.push(animation);
                });
            }
        },

        executeCallbacks: (function(){

            var currentTime = 0;

            return function(time, videoTime){

                // allow precision to one tenth of a second
                var seconds = roundTime(videoTime),
                me = this;

                if (seconds > currentTime || seconds < currentTime) {
                    currentTime = seconds;
                    var callbacks = me.callbacks[seconds] || [];
                    _.forEach(callbacks, function(cb){
                        cb();
                    });
                }
            }
        })(),

        seek: (function(){

            var animationsToStart = function(me, seconds) {

                var toStart = [];

                for(var i = 0; i < me.timeModel.length; i++) {

                    var animation = me.timeModel[i];

                    //stop looking, nothing else is running
                    if (animation.startsAt > seconds) {
                        break;
                    }

                    if (animation.endsAt > seconds) {
                        toStart.push(animation);
                    }
                }
                return toStart;
            };

            /* seek function */
            return function(videoTime, playNow){

                // 1. go through each to start
                //2. set the animation delay so it starts at the right place
                //3. start 'em up.

                var me = this,
                seconds = roundTime(videoTime),
                toStart = animationsToStart(me, seconds);

                // go through each animation to start
                _.forEach(toStart, function(animation){

                    //set the delay to start the animation at the right place
                    setDelay(animation, seconds);

                    //start it up
                    animation.start();

                    /* if the move is playing right now, then let the animation
                     * keep playing, otherwise pause the animation to wait
                     * until the video resumes.
                     */

                    if (playNow) {
                        me.running.push(animation);

                    } else {
                        me.paused.push(animation);
                        animation.pause();
                    }
                });
            }
        })(),

        pauseAnimations: function(){

            var me = this,
            animation;
            
            while(animation = me.running.pop()){
                animation.pause();
                //keep track of paused animations so we can resume them later ...
                me.paused.push(animation);
            }
        },

        clearAnimations: function(){

            var me = this,
            animation;

            /* Need to be playing in order 
             * to cause a reflow, otherwise 
             * the offset fix in the reset method
             * of the animation class has no effect.
             */
            me.resumeAnimations();

            while(animation = me.running.pop()){
                animation.reset();
            }
            while(animation = me.paused.pop()){
                animation.reset();
            }

        },

        resumeAnimations: function(){

            var me = this,
            animation;

            while (animation = me.paused.pop()){
                animation.resume();
                me.running.push(animation);
            }
        },

        bind: (function() {

            var createAnimations = function(me, cssAnimations, startTimes, callbacks){

                _.forEach(_.keys(startTimes),
                          function(name){
                              
                              var keyframe = cssAnimations.keyframes[name],
                              cssRule = cssAnimations.cssRules[name];
                              
                              _.forEach(startTimes[name], function(startTime){
                                  var animation = new Animation(
                                      name,
                                      cssRule,
                                      keyframe,
                                      startTime.element,
                                      startTime.time);
                                  
                                  me.animations[name] = me.animations[name] || [];
                                  me.bySeconds[animation.startsAt] = 
                                      me.bySeconds[animation.startsAt] || [];
                                  
                                  me.animations[name].push(animation);
                                  me.bySeconds[animation.startsAt].push(animation);
                              });
                          });
            },

            createTimeModel = function(me, animations) {
                me.timeModel = _.sortBy(animations, "endsAt" );
            };

            /* The AnimationController bind method */
            return function(cssAnimations, startTimes){

                var me = this;
                createAnimations(me, cssAnimations, startTimes);

                var animations = _.flatten(_.values(me.animations));
                createTimeModel(me, animations);

                me.callbacks = callbacks;
            }
        })()/* returns the bind method*/
    }
    CHARLIE.AnimationController = AnimationController;


    /************************************************************************
     * Animation
     */
    var Animation = function(name, cssRule, keyframe, element, startsAt){

        assert(name, "You can't create an animation without a name");
        assert(cssRule, "No CSS rule defined for animation " + name);
        assert(keyframe, "No keyframe defined for animation " + name);
        assert(element, "No element found. Animations must be bound to a DOM element.");
        assert(startsAt, "No start time provided for the animation");

        this.name = name;
        this.element = element;
        this.cssRule = cssRule;
        this.keyframe = keyframe;
        this.startsAt = roundTime(Number(startsAt));
        this.duration = calculatedDuration(cssRule.style);
        this.endsAt = this.startsAt + this.duration;
    };

    Animation.prototype = {

        name: "",
        element: null,
        cssRule: null,
        keyframe: null,
        startsAt: -1,
        duration: -1,
        endsAt: -1,
        
        start: function(){
            var me = this;
            //The name of the animation is the same as the class name by convention.
            me.element.classList.add(me.name);
            onAnimationEnd(me.element, function(){
                me.reset();
            });
        },

        reset: function(){
            this.element.classList.remove(this.name);

            // cause a reflow, otherwise the animation isn't fully 
            // removed. (let's call this a browser bug).
            this.element.offsetWidth = this.element.offsetWidth;

            //reset any calculated animation delays.
            setDelay(this, 0);
        },
        
        pause: function(){
            this.element.style.webkitAnimationPlayState = "paused";
            this.element.style.mozAnimationPlayState = "paused";
            this.element.style.oAnimationPlayState = "paused"; 
            this.element.style.animationPlayState = "paused"; 
        },

        resume: function(){
            this.element.style.webkitAnimationPlayState = "running";
            this.element.style.mozAnimationPlayState = "running";
            this.element.style.oAnimationPlayState = "running"; 
            this.element.style.animationPlayState = "running"; 
        }

    }
    CHARLIE.Animation = Animation;


    /************************************************************************
     * BigLoop
     */
    var BigLoop = function(controller){
        assert(controller, "Can't create a BigLoop without an AnimationController");
        this.controller = controller;
    };

    BigLoop.prototype = {

        controller: null,
        video: null,
        running: false,
        frameID: -1,

        bind: function(video){
            //start and stop the loop when the video
            //starts and stops
            this.video = video;
            video.addEventListener("play", this.start.bind(this), false);
            video.addEventListener("ended", this.ended.bind(this), false);
            video.addEventListener("pause", this.stop.bind(this), false);
            video.addEventListener("seeked", this.seeked.bind(this), false);
        },

        ended: function(){
            this.controller.clearAnimations();
        },

        seeked: function(){
            this.controller.clearAnimations();
            this.controller.seek(video.currentTime, !this.video.paused);
        },

        tick: function(time){
            if (this.running){
                this.frameID = requestAnimationFrame(this.tick.bind(this));
                this.controller.startAnimations(time, this.video.currentTime);
                this.controller.executeCallbacks(time, this.video.currentTime);
            }
        },

        start: function() {
            this.running = true;
            this.tick();
        },

        stop: function(){
            if (this.frameID){
                cancelAnimationFrame(this.frameID);
                this.frameID = -1;
            }
            this.running = false;
            this.controller.pauseAnimations();
        }
    }
    
    var callbacks = {};
    CHARLIE.setup = function(video){
        var cssAnimations = CSSAnimations.create(),
        animationData = scrapeAnimationData(),
        controller = new AnimationController(),
        loop = new BigLoop(controller);
        controller.bind(cssAnimations, animationData, callbacks);
        loop.bind(video);
    }
    
    CHARLIE.addCallback = function(callback, time){
        time = roundTime(time);
        var cbs = callbacks[time] || [];
        cbs.push(callback);
        callbacks[time] = cbs;
    }

})();