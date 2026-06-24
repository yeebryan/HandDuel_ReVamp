# What I Learned Building HandDuel

*A blog-post draft. Personal perspective. Edit freely.*

---

I built a Rock-Paper-Scissors game you play with your hands in front of a webcam. No controller, no app to install — just open a link, hold up rock, paper, or scissors, and the computer plays you back.

It's a small thing. Probably ten people will ever play it. But building it taught me more about how products fail in the boring middle than any framework tutorial ever has. Here's a notebook of the things that surprised me.

---

## The cloud is not one thing

I started thinking "I'll deploy on Vercel" and somehow that meant "the whole thing."

Turns out, the kind of thing you can deploy depends on what shape your code is. The frontend — the part that runs in the user's browser — fits Vercel beautifully. It's just files, served fast from edge servers near the user.

The backend — the part that needs to remember things, like which two players are currently waiting for a match — is a different animal. It needs to *stay running* and *remember state between requests*. Vercel can run code, but it spins up a fresh copy for every request. Two players hitting two different copies of the server would never find each other.

So now I run two services in two places: the frontend on Vercel, the backend on a different platform called Render. Different deploy buttons, different dashboards, different bills (zero so far, but still).

**The lesson:** "Where should this live?" is a real question every time. Marketing pages, online stores, game servers, AI chatbots — they all need different shapes of infrastructure, even though we call all of them "the cloud."

---

## Free tier is a relationship, not a feature

The backend goes to sleep when nobody uses it. After 15 minutes of silence, Render shuts it down to save electricity. When the next person shows up to play, they wait 30 to 50 seconds while it boots back up.

That's the deal: free hosting, but the first guest stands awkwardly on the doorstep.

Worse — when it sleeps, anything in its memory disappears. I learned this when the leaderboard reset itself overnight. Players' scores were stored "in memory" — which sounds permanent if you're not paying attention, but actually means "in a process that's about to die."

The fix wasn't more code, it was *the right kind of memory*. I moved the leaderboard from RAM to a permanent file in cloud storage. Now scores survive the server going to sleep, getting redeployed, even hardware failures.

**The lesson:** "Free" often means "you handle the failure modes the paid version handles for you." Cheaper isn't always cheaper.

---

## The first version of the game design was wrong

When I added a leaderboard, I noticed something strange.

The first version of Player-vs-CPU let you play forever. Win or lose, the score kept going up cumulatively. I thought a leaderboard would naturally make the game more competitive.

It made the game *worse* — for events specifically. Because here's what happens at a booth: one confident person sits down, plays for ten minutes straight, racks up a score nobody else can touch, while a line forms behind them. The leaderboard didn't create competition — it created a chokepoint.

So I changed the game. Now you play until you lose. *One loss ends your run.* Your score is your *win streak* before that loss. The leaderboard ranks longest streak ever.

This changed everything:
- Sessions naturally end (good for queue throughput).
- Tension *grows* with every round — "can I keep going?" instead of "how high can I get?"
- Spectators get drawn in around the 4th or 5th win — does this person make it to ten?

I had to delete features to make this work. The cumulative score display, the indefinite playtime, all of it.

**The lesson:** "Add a leaderboard" is not a design fix. It's a multiplier. You first need a game shape that resolves on its own.

---

## Trust is a UX problem

A friend played one round, lost, and immediately asked: "Wait — is the computer cheating?"

He wasn't joking. Watching the CPU's emoji cycle ✊ → 🖐️ → ✌️ during the countdown and "settle" on its pick at the moment of reveal *did* look like the computer was reacting to what he had thrown. Even though, mechanically, it picks randomly *before* the round and just animates the suspense.

There's no piece of "correct" code that would change his impression. He needed a *signal*. So I added a tiny "🎲 RANDOM" tag under the CPU's panel that just sits there. A hover-tooltip says "CPU picks randomly before the round — it can't see your hand."

It looks like nothing. But the doubt stops landing.

**The lesson:** If users can't tell whether something is fair, it isn't — even if your code is honest. Trust is a feeling, and feelings need shape.

---

## Players don't read; they react

The countdown goes 3 → 2 → 1 → SHOOT, with the gesture captured at SHOOT.

Players started losing rounds and going "what?? but I threw paper!" I'd watch the replay in my head: they showed scissors at "1", then started transitioning to paper, then SHOOT fired, and the camera captured an in-between shape that classified as rock.

Their reality was "I threw paper." The system's reality was "you threw rock-ish at the moment that mattered." Both true.

No amount of "well actually" would fix this. I added a "LOCKED ✊" flash that pops in the moment the capture happens, showing the exact gesture that got recorded. It's there for half a second.

Two effects:
1. People immediately understand what was captured — disputes vanish.
2. People *learn the rhythm* — by the third round they instinctively commit by SHOOT, not by "1." No tutorial needed.

**The lesson:** Showing what happened is more effective than explaining what should have happened.

---

## Asking for the camera is not automatic

Getting webcam access feels like it should be one line of code. It is — until it isn't.

The first version called `getUserMedia` as soon as the page loaded. On most browsers this is fine the first time. But if a user had previously dismissed or denied the camera prompt on that domain, the browser silently rejects the next call without showing a dialog. No error the user can see. No way to retry without refreshing the page. The game just sat there, broken, with no explanation.

The fix was a dedicated "Enable Camera" screen. The page loads, MediaPipe initializes in the background, and then it shows: *"This game uses your camera to read your hand gestures. Click to grant access."* `getUserMedia` only fires when the user clicks the button. If it fails, an error message explains why — "No camera found," "Camera is in use by another app" — with a "Try Again" button that doesn't require a page refresh.

Perceived load time actually *improved*, because MediaPipe was downloading its 8MB model file while the user was reading the explanation screen.

**The lesson:** Permissions are a conversation, not an API call. Give users context before you ask, and give them a way back if they say no.

---

## One word in a camera constraint can make it unusable

When you call `getUserMedia`, you can pass constraints describing what you want: resolution, frame rate, which camera.

I added `facingMode: 'user'` — a standard constraint meaning "give me the front-facing camera." It worked fine on my phone. On my laptop it threw `NotFoundError: no camera found` — even though the camera was sitting right there, working.

The reason: `facingMode: 'user'` means "I need a camera that identifies itself as front-facing." Most desktop webcams don't report a facing mode at all. So the browser searches for a camera that matches `user`, finds none, and throws an error. The camera isn't missing — it just doesn't fit the description.

The fix was one word: `{ video: true }` instead of `{ video: { facingMode: 'user' } }`. "Give me any camera" instead of "give me this specific kind of camera." The CSS `transform: scaleX(-1)` on the video element already handled the mirror flip, so the constraint was doing nothing useful anyway.

**The lesson:** When something works on your phone but not on your laptop, the constraint is probably too specific. Start permissive, restrict only when you have a real reason.

---

## The webcam doesn't have to be a texture

My first instinct for the fullscreen webcam layout was to load the video into Three.js as a texture, map it onto a background plane, and render everything on one canvas. This felt "clean" — one renderer, one canvas, one coordinate system.

It's wrong, and I spent time finding out why.

Video-as-texture means Three.js is uploading every frame to the GPU as a new texture. The video looks slightly wrong — color profiles, timing, letterboxing artifacts. The whole scene has to be opaque, so if you want to put anything "between" the video and the 3D content, you're doing it inside Three.js, which gets complicated fast. And if the user has a GPU delegate disabled for WebGL, the whole thing stutters.

The better approach: make the `<video>` element the actual background of the page. `position: fixed; inset: 0; object-fit: cover; transform: scaleX(-1)`. Then layer a transparent Three.js canvas on top with `alpha: true` and `setClearColor(0x000000, 0)`. The browser composites them — it's literally designed for this.

The MediaPipe landmark skeleton goes on a third canvas between the two, also transparent. The final stack is: video → landmarks → Three.js gestures → UI. Each layer handles its own job, independently.

**The lesson:** Native HTML elements are often better at being themselves than a 3D renderer pretending to be them. Reach for layering before reaching for textures.

---

## Fake glow without the performance cost

The hand skeleton needed a neon-glow aesthetic. The obvious approach is `shadowBlur` on the canvas context.

`shadowBlur` is the single biggest canvas performance killer. It forces the browser to render an off-screen composite for every draw call. On a busy frame — skeleton and joints for two hands, every animation frame — it tanks to 20fps.

The trick: draw the same line three times, each slightly wider and more transparent than the last. Wide + faint → medium + mid → thin + bright. The `lighter` composite mode makes overlaps brighten where they cross, which looks like a glow. No off-screen buffer, no blur pass, no performance cost.

```
{ width: 10, color: 'rgba(62,255,216,0.18)' }   // soft halo
{ width: 4,  color: 'rgba(62,255,216,0.55)' }   // mid glow
{ width: 1.5, color: 'rgba(220,255,250,0.95)' } // bright core
```

It renders at 60fps. `shadowBlur` hit 20fps on the same hardware.

**The lesson:** When a visual effect has a well-known performance cost, look for a fake version first. The eye can usually be fooled cheaper than the GPU can be brute-forced.

---

## Mobile is not a smaller desktop

I built this on a laptop. It worked beautifully on a laptop. I sent the link to a friend on a phone and the whole top of the screen was unreadable: the back button was the size of a postage stamp, the status text was 9 pixels tall, and the bottom bar had three things crammed into a space that fit two.

The fix wasn't "make it responsive." It was admitting that the *layout* — not the styling — was wrong for a phone-shaped screen. Some things needed to disappear entirely on small screens. Some things needed to be twice as big. The "make it smaller everywhere" instinct is wrong; some things have to grow on a phone to remain usable.

**The lesson:** "Looks fine on my laptop" is the cheapest, most dangerous compliment you can give your own work.

---

## Bug fixes are never single-file

I fixed a bug where a modal popped up during gameplay. Two days later I noticed the same modal was now appearing in a different wrong context. I fixed *that*. A week later it stopped appearing at all in the place it was supposed to.

I'd cleaned up one symptom each time. The real problem was three layers down — a stale event listener attached to the window that should have been removed when the player navigated away. The "fixes" had been moving the bug, not removing it.

I rewrote that component to clean up after itself properly, and the family of bugs disappeared.

**The lesson:** When you see a bug move sideways instead of going away, you haven't found the cause. You're treating a fever, not the infection.

---

## Workflow is a feature you build for yourself

I started just pushing code straight to the main branch. "I'm the only developer." It was fine until it wasn't — I shipped a bug to the live site that I would have caught if I'd reviewed my own diff for ten seconds.

I switched to a system where every change opens a pull request, and a separate URL spins up with that change applied so I can click around before merging. It feels overkill for a one-person project. It isn't. The friction of "open the PR, look at the preview, then merge" forces me to be the second pair of eyes my one-person team needs.

The number of "oh wait, that's broken" moments before merging vs. after merging tells you it's worth it.

**The lesson:** Process isn't bureaucracy. It's a deliberately placed speed bump so you don't crash into your own future self.

---

## Closing thoughts

The hardest parts of this project had nothing to do with the part that's technically impressive (the camera reads your hand!). The hardest parts were:

- Deciding which platform should host which piece.
- Picking a game shape that ends naturally.
- Communicating fairness without a wall of text.
- Making camera permission feel like a conversation, not a demand.
- Getting the glow effect without killing the frame rate.
- Making something a stranger can use on a phone without instructions.
- Building a workflow that catches my own mistakes before users do.

Programming is the easy part. Making something *land* with another human is where all the work is hiding.

---

*Built in a few weeks across late nights. Bugs found by friends. Polished by frustration. Still imperfect.*
