(function(){

    
    window.sync = {};
    var sync = window.sync;


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
                 * { element: domElement,
                 *   swoopy: 6000,
                 *   swirly: 9000 }
                 * 
                 */

                var names = _.map(
                    element.dataset.animations.split(","),
                    function(name){ return name.replace(/\s+/, ""); });
                times = element.dataset.times.split(","),
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
            _.forEach(_.toArray(sheet.rules), function(rule){
                if (matches(rule)){
                    rules.push(rule);
                }
            });
        });
        return rules;
    };


    /************************************************************************
     * CSSAnimations
     */

    var CSSAnimations = function(keyframes, styles){
        this.keyframes = keyframes;
        this.styles = styles;
    };

    CSSAnimations.create = function(){
        /* create keyframe lookup */
        var   keyframeRules = findRules(function(rule){
            return rule.type === window.CSSRule.WEBKIT_KEYFRAMES_RULE; 
        }),
        keyframes = 
            _.object(
                _.map(
                    keyframeRules, 
                    function(rule){ return [rule.name, rule]; }));
        
        /* create animation styles lookup */
        var animationStyleRules = findRules(function(rule){
            return rule.style && rule.style.webkitAnimationName in keyframes;
        }),
        animationStyles = 
            _.object(
                _.map(
                    animationStyleRules,
                    function(style){ return [style.selectorText.substring(1), style]; }));
        
        return new CSSAnimations(keyframes, animationStyles);
    };
    
    CSSAnimations.prototype = {
        keyframes : {},
        styles: {},
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

            var seconds = Math.floor(videoTime),
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

                //todo: should have put the time model in a flat
                //array to begin with?
                var flattened = _.flatten(_.values(me.timeModel));
                for(var i = 0; i < flattened.length; i++) {

                    var node = flattened[i]

                    //stop looking, nothing else is running
                    if (node.startsAt > seconds) {
                        break;
                    }

                    if (node.endsAt > seconds) {
                        toStart.push(node);
                    }
                }
                return toStart;
            },

            setDelay = function(node, seconds) {
                var delay = -(seconds - node.startsAt);
                delay = delay < 0 ? delay : 0;
                node.animation.element.style.webkitAnimationDelay = delay + "s";
            };

            /* seek function */
            return function(videoTime, playNow){

                // 1. go through each to start
                //2. set the animation delay so it starts at the right place
                //3. start 'em up.

                var me = this,
                seconds = Math.floor(videoTime),
                toStart = animationsToStart(me, seconds);

                _.forEach(toStart, function(node){
                    setDelay(node, seconds);
                    if (playNow) {
                        node.animation.start();
                        running.push();
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

            while(animation = me.running.pop()){
                animation.element.classList.remove(animation.name);
            }
            while(animation = me.paused.pop()){
                animation.element.classList.remove(animation.name);
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

            var getDuration = function(style){
                /* NOTE: supports multiple iterations, but 
                 * only the same duration for each iteration.
                 * NOTE2: Time must be in seconds for now.
                 */
                var duration = style["-webkit-animation-duration"];
                duration = Number(duration.substring(0, duration.length -1)),
                iterations = Number(style["-webkit-animation-iteration-count"]);
                
                //default to 1 iteration and no duration
                return iterations ? iterations * duration : (duration || 0);
            },

            createAnimations = function(me, cssAnimations, startTimes){

                _.forEach(_.keys(startTimes), 
                          function(name){
                              
                              var keyframe = cssAnimations.keyframes[name],
                              style = cssAnimations.styles[name];
                              
                              _.forEach(startTimes[name], function(startTime){
                                  var animation = new Animation(
                                      name,
                                      style,
                                      keyframe,
                                      startTime.element,
                                      startTime.time);
                                  
                                  me.animations[name] = me.animations[name] || [];
                                  me.bySeconds[animation.startTime] = 
                                      me.bySeconds[animation.startTime] || [];
                                  
                                  me.animations[name].push(animation);
                                  me.bySeconds[animation.startTime].push(animation);
                              });
                          });
            },

            createTimeModel = function(me, animations){

                var nodes = me.timeModel;

                _.forEach(animations, function(animation){
                    var duration = getDuration(animation.style.style);
                    var timeNode = {
                        startsAt: animation.startTime,
                        endsAt: animation.startTime + duration,
                        duration: duration,
                        animation: animation 
                    };

                    nodes[timeNode.startsAt] =  nodes[timeNode.startsAt] || [];
                    nodes[timeNode.startsAt].push(timeNode);
                });
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
    var Animation = function(name, style, keyframe, element, startTime){

        assert(name, "You can't create an animation without a name");
        assert(style, "No CSS style defined for animation " + name);
        assert(keyframe, "No keyframe defined for animation " + name);
        assert(element, "No element found. Animations must be bound to a DOM element.");
        assert(startTime, "No start time provided for the animation");

        this.name = name;
        this.element = element;
        this.style = style;
        this.keyframe = keyframe;
        this.startTime = Math.floor(Number(startTime));
    };

    Animation.prototype = {
        name: "",
        element: null,
        style: null,
        keyframe: null,
        startTime: -1,
        
        start: function(){
            this.element.classList.add(this.name);
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
        video.play();
    }
    
})();