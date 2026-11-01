/* ==========================================================
   IN THE MAKING. — interaction layer (vanilla JS, no dependencies)

   1 Utilities          5 Scroll scrubs ([data-scrub] / [data-parallax])
   2 Theme              6 Scroll-linked scenes
   3 Header & menu        (hero, orbit, timeline, beyond, contact)
   4 Hero intro         7 Cursor, back to top, email
   ========================================================== */

(function () {
    "use strict";

    window.__itmReady = true;

    /* ------------------------------------------------------
       1. UTILITIES
       ------------------------------------------------------ */

    var root = document.documentElement;
    var $ = function (selector, scope) { return (scope || document).querySelector(selector); };
    var $$ = function (selector, scope) { return Array.prototype.slice.call((scope || document).querySelectorAll(selector)); };
    var clamp = function (value, min, max) {
        return Math.min(max === undefined ? 1 : max, Math.max(min === undefined ? 0 : min, value));
    };

    var reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    var motion = root.classList.contains("motion") && !reduceMotionQuery.matches;

    var vh = window.innerHeight;


    /* ------------------------------------------------------
       2. THEME
       ------------------------------------------------------ */

    var THEME_KEY = "portfolio-theme";
    var themeButton = $("#theme-toggle");
    var themeLabel = $(".theme-toggle-label", themeButton);

    function saveTheme(theme) {
        try { localStorage.setItem(THEME_KEY, theme); } catch (error) { /* storage unavailable */ }
    }

    function applyTheme(theme) {
        var dark = theme === "dark";
        root.dataset.theme = dark ? "dark" : "light";
        themeLabel.textContent = dark ? "Light" : "Dark";
        themeButton.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    }

    applyTheme(root.dataset.theme === "dark" ? "dark" : "light");

    themeButton.addEventListener("click", function () {
        var next = root.dataset.theme === "dark" ? "light" : "dark";
        applyTheme(next);
        saveTheme(next);
    });


    /* ------------------------------------------------------
       3. HEADER & MOBILE ORBIT MENU
       ------------------------------------------------------ */

    var header = $("#site-header");
    var menuButton = $("#menu-toggle");
    var menu = $("#nav-links");
    var menuLinks = $$("a", menu);
    var mobileQuery = window.matchMedia("(max-width: 900px)");
    var inertTargets = $$("main, .site-footer");

    function setMenu(open) {
        menu.classList.toggle("is-open", open);
        menuButton.classList.toggle("active", open);
        menuButton.setAttribute("aria-expanded", String(open));
        menuButton.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
        root.classList.toggle("menu-open", open);
        inertTargets.forEach(function (el) { el.inert = open; });
    }

    menuButton.addEventListener("click", function () {
        var open = !menu.classList.contains("is-open");
        setMenu(open);
        if (open && menuLinks[0]) menuLinks[0].focus({ preventScroll: true });
    });

    menuLinks.forEach(function (link) {
        link.addEventListener("click", function () { setMenu(false); });
    });

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && menu.classList.contains("is-open")) {
            setMenu(false);
            menuButton.focus();
        }
    });

    function onBreakpointChange(event) {
        if (!event.matches) setMenu(false);
    }
    if (mobileQuery.addEventListener) mobileQuery.addEventListener("change", onBreakpointChange);
    else if (mobileQuery.addListener) mobileQuery.addListener(onBreakpointChange);

    // Highlight the link for the section currently in view
    if ("IntersectionObserver" in window) {
        var navMap = {};
        menuLinks.forEach(function (link) { navMap[link.getAttribute("href")] = link; });

        var sectionObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                menuLinks.forEach(function (link) { link.removeAttribute("aria-current"); });
                var active = navMap["#" + entry.target.id];
                if (active) active.setAttribute("aria-current", "true");
            });
        }, { rootMargin: "-45% 0px -50% 0px" });

        $$("main > section[id]").forEach(function (section) { sectionObserver.observe(section); });
    }


    /* ------------------------------------------------------
       4. HERO INTRO
       Character-level split for the name; the headline is
       split into masked words in the HTML itself.
       ------------------------------------------------------ */

    $$('[data-split="chars"]').forEach(function (el) {
        var text = el.textContent.trim();
        el.textContent = "";

        var readable = document.createElement("span");
        readable.className = "sr-only";
        readable.textContent = text;

        var visual = document.createElement("span");
        visual.className = "chars";
        visual.setAttribute("aria-hidden", "true");

        Array.from(text).forEach(function (character, index) {
            var span = document.createElement("span");
            span.className = "char";
            span.style.setProperty("--i", index);
            span.textContent = character === " " ? "\u00A0" : character;
            visual.appendChild(span);
        });

        el.appendChild(readable);
        el.appendChild(visual);
    });

    function startIntro() {
        requestAnimationFrame(function () {
            requestAnimationFrame(function () { root.classList.add("is-ready"); });
        });
    }

    if (motion) {
        // Wait for the font so the headline never reflows mid-reveal (1.2s cap)
        var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
        Promise.race([
            fontsReady,
            new Promise(function (resolve) { setTimeout(resolve, 1200); })
        ]).then(startIntro);
    } else {
        root.classList.add("is-ready");
    }


    /* ------------------------------------------------------
       5. SCROLL SCRUBS
       Every [data-scrub] element gets three numbers written
       as CSS variables, so the whole page is choreographed
       from the stylesheet:
         --e   entering, 0 → 1 as it rises into view
         --o   leaving, 0 → 1 as it exits through the top
         --sp  progress through the viewport, 0 → 1
       [data-parallax="n"] adds a depth drift (--py).
       Positions are cached from layout (offsetTop), so the
       element's own transform never feeds back into its timing.
       ------------------------------------------------------ */

    var scrubs = [];
    var maxScroll = 0;

    function docTop(el) {
        var y = 0;
        while (el) { y += el.offsetTop; el = el.offsetParent; }
        return y;
    }

    if (motion) {
        $$("[data-scrub], [data-parallax]").forEach(function (el) {
            scrubs.push({
                el: el,
                delay: parseFloat(el.dataset.delay) || 0,
                parallax: parseFloat(el.dataset.parallax) || 0,
                top: 0, h: 0,
                e: 0, o: 0, sp: 0, py: 0,
                w: { e: -1, o: -1, sp: -1, py: 1e9 },
                started: false
            });
        });
    }

    function measureScrubs() {
        maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
        scrubs.forEach(function (s) {
            s.top = docTop(s.el);
            s.h = s.el.offsetHeight;
        });
    }

    function updateScrubs() {
        var busy = false;
        var y = window.scrollY;
        var atEnd = y >= maxScroll - 4;

        scrubs.forEach(function (s) {
            var top = s.top - y;
            var h = s.h;

            // Where this element sits when the page is scrolled all the way down
            var endTop = s.top - maxScroll;
            var start = vh * 0.96;
            var finish = Math.min(Math.max(vh * 0.6, endTop + 8), start - 24);

            var tE = clamp((start - top) / (start - finish) - s.delay);
            if (atEnd && top < vh) tE = 1;
            var tO = clamp((vh * 0.3 - (top + h)) / (vh * 0.32));
            var tS = clamp((vh - top) / (vh + h));
            var tP = s.parallax ? (top + h / 2 - vh / 2) * s.parallax : 0;

            var far = top > vh * 2 || top + h < -vh;

            if (!s.started || far) {
                s.e = tE; s.o = tO; s.sp = tS; s.py = tP;
                s.started = true;
            } else {
                var dE = tE - s.e, dO = tO - s.o, dS = tS - s.sp, dP = tP - s.py;
                s.e += dE * 0.14;
                s.o += dO * 0.14;
                s.sp += dS * 0.14;
                s.py += dP * 0.18;
                if (Math.abs(dE) > 0.001 || Math.abs(dO) > 0.001 || Math.abs(dS) > 0.001 || Math.abs(dP) > 0.3) busy = true;
            }

            var style = s.el.style;
            if (Math.abs(s.e - s.w.e) > 0.0005) { style.setProperty("--e", s.e.toFixed(4)); s.w.e = s.e; }
            if (Math.abs(s.o - s.w.o) > 0.0005) { style.setProperty("--o", s.o.toFixed(4)); s.w.o = s.o; }
            if (Math.abs(s.sp - s.w.sp) > 0.0005) { style.setProperty("--sp", s.sp.toFixed(4)); s.w.sp = s.sp; }
            if (s.parallax && Math.abs(s.py - s.w.py) > 0.2) { style.setProperty("--py", s.py.toFixed(1) + "px"); s.w.py = s.py; }
        });

        return busy;
    }


    /* ------------------------------------------------------
       6. SCROLL-LINKED SCENES
       One requestAnimationFrame loop drives every scene.
       Each scene turns scroll position into a 0–1 value,
       eases toward it, and writes CSS variables / transforms.
       Scenes outside the viewport are skipped.
       ------------------------------------------------------ */

    var scenes = [];
    var measurers = [measureScrubs];
    var ticking = false;

    function requestTick() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(tick);
    }

    function defineScene(config) {
        var scene = {
            el: config.el,
            ease: config.ease || 0.12,
            target: config.target,
            apply: config.apply,
            value: 0,
            started: false,
            active: true,
            flush: true
        };
        scenes.push(scene);
        return scene;
    }

    function tick() {
        ticking = false;
        var busy = false;

        scenes.forEach(function (scene) {
            if (!scene.active && !scene.flush) return;

            var target = scene.target();

            if (!scene.started || scene.flush || !motion) {
                scene.value = target;
                scene.started = true;
                scene.flush = false;
                scene.apply(scene.value);
                return;
            }

            var delta = target - scene.value;
            if (Math.abs(delta) > 0.0008) {
                scene.value += delta * scene.ease;
                busy = true;
            } else {
                scene.value = target;
            }
            scene.apply(scene.value);
        });

        if (updateScrubs()) busy = true;
        if (busy) requestTick();
    }

    // 0 when the element's top meets the viewport bottom, 1 when its bottom leaves the top
    function through(el) {
        var rect = el.getBoundingClientRect();
        return clamp((vh - rect.top) / (vh + rect.height));
    }

    /* ---- Hero: content drifts and the orbit turns as you leave ---- */
    var hero = $("#home");
    if (hero && motion) {
        defineScene({
            el: hero,
            ease: 0.2,
            target: function () {
                var rect = hero.getBoundingClientRect();
                return clamp(-rect.top / rect.height);
            },
            apply: function (value) {
                hero.style.setProperty("--hp", value.toFixed(4));
            }
        });
    }

    /* ---- Projects: planets travel their rings with scroll ---- */
    var orbitStage = $(".orbit-stage");
    if (orbitStage) {
        var system = $(".orbit-system", orbitStage);
        var size = system.clientWidth;

        // rx / ry are fractions of the system width; angles in degrees.
        // rot: null means "follow the tilting ellipse ring".
        var paths = {
            one:   { rx: 0.42, ry: 0.42, rot: 0,    phase: -125, sweep: 200 },
            two:   { rx: 0.47, ry: 0.21, rot: null, phase: 205,  sweep: -320 },
            three: { rx: 0.31, ry: 0.31, rot: 0,    phase: 35,   sweep: 380 }
        };

        var planets = $$(".orbit-planet", system).map(function (el) {
            return { el: el, path: paths[el.dataset.planet] };
        });

        var orbitTop = 0;
        var orbitHeight = 0;
        var measureOrbit = function () {
            size = system.clientWidth;
            orbitTop = docTop(orbitStage);
            orbitHeight = orbitStage.offsetHeight;
        };
        measurers.push(measureOrbit);
        measureOrbit();

        defineScene({
            el: orbitStage,
            ease: 0.085,
            target: function () {
                // cached position: the stage scales in, so its live rect would feed back
                return motion ? clamp((vh - (orbitTop - window.scrollY)) / (vh + orbitHeight)) : 0.45;
            },
            apply: function (p) {
                var tilt = -35 + p * 24;
                system.style.setProperty("--p", p.toFixed(4));
                system.style.setProperty("--tilt", tilt.toFixed(2) + "deg");

                planets.forEach(function (planet) {
                    var path = planet.path;
                    var angle = (path.phase + path.sweep * p) * Math.PI / 180;
                    var rotation = (path.rot === null ? tilt : path.rot) * Math.PI / 180;
                    var ex = path.rx * Math.cos(angle);
                    var ey = path.ry * Math.sin(angle);
                    var x = (ex * Math.cos(rotation) - ey * Math.sin(rotation)) * size;
                    var y = (ex * Math.sin(rotation) + ey * Math.cos(rotation)) * size;
                    planet.el.style.transform = "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0)";
                });
            }
        });

        // Hovering a project row highlights its planet
        $$(".project-item").forEach(function (item) {
            var planet = $('.orbit-planet[data-planet="' + item.dataset.planet + '"]', system);
            if (!planet) return;
            var on = function () { planet.classList.add("is-highlight"); };
            var off = function () { planet.classList.remove("is-highlight"); };
            item.addEventListener("mouseenter", on);
            item.addEventListener("mouseleave", off);
            item.addEventListener("focusin", on);
            item.addEventListener("focusout", off);
        });
    }

    /* ---- Journey: the line draws, entries light up as it reaches them ---- */
    var timeline = $(".journey-timeline");
    if (timeline && motion) {
        var journeyItems = $$(".journey-item", timeline);
        var centers = [];
        var lineTop = 24;
        var lineHeight = 100;

        var measureTimeline = function () {
            centers = journeyItems.map(function (item) {
                var number = $(".journey-number", item);
                return item.offsetTop + number.offsetTop + number.offsetHeight / 2;
            });
            lineTop = centers[0];
            lineHeight = Math.max(1, centers[centers.length - 1] - centers[0]);
            timeline.style.setProperty("--line-top", lineTop + "px");
            timeline.style.setProperty("--line-h", lineHeight + "px");
        };
        measurers.push(measureTimeline);
        measureTimeline();

        defineScene({
            el: timeline,
            ease: 0.1,
            target: function () {
                var rect = timeline.getBoundingClientRect();
                var readingLine = vh * 0.62 - rect.top;
                return clamp((readingLine - lineTop) / lineHeight);
            },
            apply: function (p) {
                timeline.style.setProperty("--tl", p.toFixed(4));
                var reach = lineTop + p * lineHeight;
                journeyItems.forEach(function (item, index) {
                    item.classList.toggle("is-lit", p > 0.001 && reach >= centers[index] - 1);
                });
            }
        });
    }

    /* ---- Beyond work: type scales, ring grows and turns ---- */
    var beyond = $("#beyondwork");
    if (beyond) {
        defineScene({
            el: beyond,
            ease: 0.08,
            target: function () { return motion ? through(beyond) : 0.5; },
            apply: function (p) { beyond.style.setProperty("--p", p.toFixed(4)); }
        });
    }

    /* ---- Contact: the dark panel opens, then the words follow ---- */
    var contact = $("#contact");
    if (contact && motion) {
        var contactReveals = $$("[data-reveal]", contact);
        var contactOpen = false;

        contactReveals.forEach(function (el, index) {
            el.style.setProperty("--d", index * 110 + "ms");
        });

        defineScene({
            el: contact,
            ease: 0.1,
            target: function () {
                var rect = contact.getBoundingClientRect();
                return clamp((vh - rect.top) / (vh * 0.75));
            },
            apply: function (p) {
                contact.style.setProperty("--p", p.toFixed(4));
                // Hysteresis so text never sits on a panel that hasn't opened yet
                if (p > 0.55 && !contactOpen) {
                    contactOpen = true;
                    contactReveals.forEach(function (el) { el.classList.add("is-in"); });
                } else if (p < 0.35 && contactOpen) {
                    contactOpen = false;
                    contactReveals.forEach(function (el) { el.classList.remove("is-in"); });
                }
            }
        });
    } else if (contact) {
        $$("[data-reveal]", contact).forEach(function (el) { el.classList.add("is-in"); });
    }

    /* ---- Scene plumbing ---- */
    if ("IntersectionObserver" in window) {
        var sceneObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                scenes.forEach(function (scene) {
                    if (scene.el !== entry.target) return;
                    scene.active = entry.isIntersecting;
                    if (!entry.isIntersecting) scene.flush = true;
                });
            });
            requestTick();
        }, { rootMargin: "25% 0px 25% 0px" });

        scenes.forEach(function (scene) { sceneObserver.observe(scene.el); });
    }

    var progressBar = $(".scroll-progress");

    function onScroll() {
        header.classList.toggle("is-scrolled", window.scrollY > 8);
        if (progressBar && maxScroll > 0) {
            progressBar.style.transform = "scaleX(" + clamp(window.scrollY / maxScroll).toFixed(4) + ")";
        }
        if (motion) requestTick();
    }

    function remeasure() {
        vh = window.innerHeight;
        measurers.forEach(function (measure) { measure(); });
        onScroll();
        requestTick();
    }

    function onResize() {
        remeasure();
        scenes.forEach(function (scene) { scene.flush = true; });
        requestTick();
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("load", onResize);

    if ("ResizeObserver" in window) {
        // Fonts or images changing the page height shift every cached position
        new ResizeObserver(remeasure).observe(document.body);
    }

    remeasure();
    tick();


    /* ------------------------------------------------------
       7. CURSOR & BACK TO TOP
       ------------------------------------------------------ */

    // Glowing cursor: only for devices with a mouse
    var cursor = $(".custom-cursor");
    var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

    if (cursor && finePointer.matches) {
        root.classList.add("has-cursor");

        var targetX = 0, targetY = 0, currentX = 0, currentY = 0;
        var cursorRunning = false;
        var cursorShown = false;

        var cursorLoop = function () {
            var follow = motion ? 0.22 : 1;
            currentX += (targetX - currentX) * follow;
            currentY += (targetY - currentY) * follow;
            cursor.style.transform = "translate3d(" + currentX.toFixed(1) + "px," + currentY.toFixed(1) + "px,0)";

            if (Math.abs(targetX - currentX) > 0.1 || Math.abs(targetY - currentY) > 0.1) {
                requestAnimationFrame(cursorLoop);
            } else {
                cursorRunning = false;
            }
        };

        document.addEventListener("mousemove", function (event) {
            targetX = event.clientX;
            targetY = event.clientY;

            if (!cursorShown) {
                cursorShown = true;
                currentX = targetX;
                currentY = targetY;
                cursor.classList.add("is-visible");
                root.classList.add("cursor-active");
            }

            if (!cursorRunning) {
                cursorRunning = true;
                requestAnimationFrame(cursorLoop);
            }
        }, { passive: true });

        document.addEventListener("mouseover", function (event) {
            var interactive = event.target.closest && event.target.closest("a, button, input, textarea, select, summary, [role='button']");
            cursor.classList.toggle("hover", Boolean(interactive));
        });

        root.addEventListener("mouseleave", function () { cursor.classList.remove("is-visible"); });
        root.addEventListener("mouseenter", function () {
            if (cursorShown) cursor.classList.add("is-visible");
        });
    }

    // Email and feedback use native mailto links in index.html.
    // The visitor's configured email app/browser handler opens directly.
    async function copyEmail() {

        const email = document.getElementById("emailText").textContent.trim();
        const status = document.getElementById("copyStatus");

        try {

            try {
                await navigator.clipboard.writeText(email);
            } catch (clipboardError) {

                // Fallback
                const textarea = document.createElement("textarea");
                textarea.value = email;

                textarea.style.position = "fixed";
                textarea.style.left = "-9999px";

                document.body.appendChild(textarea);
                textarea.select();

                const success = document.execCommand("copy");
                textarea.remove();

                if (!success) throw new Error("Copy failed");
            }

            status.textContent = "Email copied successfully! ✓";

        } catch (error) {
            console.error("Email copy error:", error);
            status.textContent = "Unable to copy email!";
        }

        setTimeout(() => {
            status.textContent = "";
        }, 2000);
    }
    const copyEmailBtn = document.getElementById("copyEmailBtn");

    if (copyEmailBtn) {
        copyEmailBtn.addEventListener("click", copyEmail);
    }

    // Back to top
    var backToTop = $(".back-to-top");
    if (backToTop) {
        backToTop.addEventListener("click", function (event) {
            event.preventDefault();
            window.scrollTo({ top: 0, behavior: reduceMotionQuery.matches ? "auto" : "smooth" });
            if (history.replaceState) history.replaceState(null, "", "#home");
        });
    }
})();
