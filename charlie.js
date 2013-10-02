(function(){

    /* 
     * requires: dataset, classlist, getElementsByClassName
     */
 
    window.sync = {};
    var sync = window.sync;


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
            document.getElementsByClassName("animated"),
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

                var names = _.map(
                    element.dataset.animations.split(","), //the animation names
                    function(name){ return name.replace(/\s+/, ""); }), //remove whitespace

                times = _.map(
                    element.dataset.times.split(","), //get times
                    function(time){ return time.replace(/\s+/, ""); }); //remove whitespace

                tuples = _.zip(names, times);
                
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
            _.forEach(_.toArray(sheet.cssRules), function(rule){
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
        /* NOTE: supports multiple iterations, but 
         * only the same duration for each iteration.
         * NOTE2: Time must be in seconds for now.
         */
        var duration = animationDuration(style);
        duration = Number(duration.substring(0, duration.length -1)),
        iterations = Number(style["-webkit-animation-iteration-count"]);
        
        //default to 1 iteration and no duration
        return iterations ? iterations * duration : (duration || 0);
    },

    onAnimationEnd = function(element, callback) {
        element.addEventListener("webkitAnimationEnd", callback, false);
        element.addEventListener("mozAnimationEnd", callback, false);
        element.addEventListener("msAnimationEnd", callback, false);
        element.addEventListener("oAnimationEnd", callback, false);
        element.addEventListener("animationend", callback, false);
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
            return rule.style && rule.style[animationName(rule.style)] in keyframes;
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
    sync.CSSAnimations = CSSAnimations;


    /************************************************************************
     * Animation Controller 
     */

    var AnimationController = function(animations, bySeconds, timeModel){
        this.animations = animations || {};
        this.bySeconds = bySeconds || {};
        this.running = [];
        this.paused = [];
        this.timeModel = timeModel || {};
    };

    AnimationController.prototype = {

        animations: {},
        bySeconds: {},
        running: [],
        paused: [],
        timeModel: {},

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
                
                _.forEach(notRunning, function(animation){
                    animation.start();
                    me.running.push(animation);
                });
            }
        },

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
            },

            setDelay = function(animation, seconds) {
                var delay = -(seconds - animation.startsAt);
                delay = delay < 0 ? delay : 0,
                milliseconds = Math.floor(delay * 1000) + "ms";
                animation.element.style.webkitAnimationDelay = milliseconds;
                animation.element.style.mozAnimationDelay = milliseconds;
                animation.element.style.oAnimationDelay = milliseconds;
                animation.element.style.msAnimationDelay = milliseconds;
                animation.element.style.animationDelay = milliseconds;
            };

            /* seek function */
            return function(videoTime, playNow){

                // 1. go through each to start
                //2. set the animation delay so it starts at the right place
                //3. start 'em up.

                var me = this,
                seconds = roundTime(videoTime),
                toStart = animationsToStart(me, seconds);

                _.forEach(toStart, function(animation){
                    setDelay(animation, seconds);
                    animation.start();
                    if (playNow) {
                        me.running.push(animation);
                    } else {
                        me.paused.push(animation);
                        animation.element.style.webkitAnimationPlayState = "paused";
                        animation.element.style.mozAnimationPlayState = "paused";
                        animation.element.style.oAnimationPlayState = "paused"; 
                        animation.element.style.animationPlayState = "paused"; 
                    }
                });
            }
        })(),

        pauseAnimations: function(){

            var me = this,
            animation;
            
            while(animation = me.running.pop()){
                animation.element.style.webkitAnimationPlayState = "paused";
                animation.element.style.mozAnimationPlayState = "paused";
                animation.element.style.oAnimationPlayState = "paused"; 
                animation.element.style.animationPlayState = "paused"; 
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
                animation.element.style.webkitAnimationPlayState = "running";
                animation.element.style.mozAnimationPlayState = "running";
                animation.element.style.oAnimationPlayState = "running"; 
                animation.element.style.animationPlayState = "running"; 
                me.running.push(animation);
            }
        },

        bind: (function() {

            var createAnimations = function(me, cssAnimations, startTimes){

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
            }
        })()/* returns the bind method*/
    }
    sync.AnimationController = AnimationController;


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

            //cross-browserize
            this.element.style.webkitAnimationDelay = "";
        }
    }
    sync.Animation = Animation;


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
            video.addEventListener("play", this.start.bind(this));
            video.addEventListener("ended", this.ended.bind(this));
            video.addEventListener("pause", this.stop.bind(this));
            video.addEventListener("seeked", this.seeked.bind(this));
        },

        ended: function(){
            this.controller.clearAnimations();
        },

        seeked: function(){
            this.controller.clearAnimations();
            this.controller.seek(video.currentTime, !video.paused);
        },

        tick: function(time){
            if (this.running){
                this.frameID = requestAnimationFrame(this.tick.bind(this));
                this.controller.startAnimations(time, video.currentTime);
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
    

    window.onload = function(){
        var video = document.getElementById("video"),
        cssAnimations = CSSAnimations.create(),
        animationData = scrapeAnimationData(),
        controller = new AnimationController(),
        loop = new BigLoop(controller);
        controller.bind(cssAnimations, animationData);
        loop.bind(video);
        video.load();
        
        video.addEventListener("canplay", function(){
            video.play();
        });
    }
    
})();