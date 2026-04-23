# NewsHub Frontend Replication Brief

Use this brief as a build prompt for an AI or developer. The goal is to recreate the **same frontend interface, same user flows, and same functional behavior** of the current `NewsHub` project as closely as possible.

## 1. Product Overview

Build a modern **news aggregation web app** called **NewsHub**.

The app is an Angular single-page application with these main goals:

- Show curated news articles by category.
- Let users filter articles by category, country, source, date, and data type.
- Let users register, log in, choose interests, and personalize the home feed.
- Let logged-in users save articles and post comments.
- Let users manage profile data from a polished profile dashboard.
- Let users simulate a Premium subscription.
- Let Premium users access an **article-aware AI assistant** on the article details page.

The UI style is **clean editorial SaaS**, with:

- light neutral backgrounds
- rounded cards
- subtle shadows
- large modern typography
- dark gradient hero sections
- orange and sky-blue accent colors
- optional dark mode

This is **not** a noisy media site. It should feel premium, calm, modern, and structured.

## 2. Tech Stack and App Shape

Recreate it as:

- Angular standalone components
- Angular Router
- Angular Forms and Reactive Forms
- RxJS for service flows
- Bootstrap available for form helpers/spinners/buttons, but most layout and page identity comes from custom CSS

Main route structure:

- `/` -> home page
- `/profile` -> profile dashboard
- `/premium` -> premium simulation page
- `/details/:id` -> article details page
- `/login` -> auth card in login mode
- `/register` -> auth card in signup mode

Fallback route:

- any unknown route redirects to `/`

## 3. Global Design System

### 3.1 Global feel

The entire app uses a polished card-based system with generous spacing and soft edges.

- main background in light mode: very light gray `#f7f7f8`
- main card background: white
- main text: deep slate `#0f172a`
- muted text: slate gray `#64748b`
- border: light gray `#e5e7eb`
- large card radius: around `18px`
- medium radius: around `14px`
- global max content width: `1240px`
- default shadow: soft and diffused, not dramatic

Dark theme exists and is toggled with a header button.

Dark theme variables:

- page background becomes deep blue/charcoal
- card backgrounds become dark navy
- borders darken
- text becomes light gray

Theme is applied by setting `data-theme="light|dark"` on the root element and persisted in `localStorage`.

### 3.2 Typography

- font family: `Inter, Arial, Helvetica, sans-serif`
- large bold headlines
- section titles are often very large and editorial
- pill labels use uppercase tiny text with strong letter spacing

### 3.3 Visual motifs

Use these recurring visual patterns:

- sticky translucent top header with blur
- dark gradient hero banners
- orange gradient CTA buttons
- pill badges and chips
- content grouped inside rounded cards
- radial gradient highlights in heroes and premium/assistant areas

### 3.4 Responsive behavior

The app must adapt well to tablet and mobile.

Patterns:

- 3-column grids collapse to 2 columns, then 1 column
- header actions wrap on smaller screens
- side-by-side hero layouts become stacked vertically
- forms move from multi-column to single-column

Important breakpoints used repeatedly:

- around `1180px`
- around `1100px`
- around `1024px`
- around `900px`
- around `760px`
- around `700px`

## 4. Shared Layout and Core Components

### 4.1 Header

The header is sticky at the top and visible across all main pages except the auth screen.

Header contents:

- left: NewsHub logo with newspaper-style icon and the word `NewsHub`
- right: actions

Header behavior:

- always show a theme toggle button labeled `Light` or `Dark`
- if user is logged out:
  - show `Premium`
  - show `Login`
  - show `Register`
- if user is logged in:
  - if not premium, show `Go Premium`
  - show a profile pill with:
    - circular avatar with first letter of user name
    - full name
    - premium badge if premium
    - dropdown arrow

Profile dropdown contains:

- full name
- email
- membership chip showing `Premium member` or `Standard member`
- link to `My Profile`
- link to premium page
- logout button

Interactions:

- click outside closes dropdown
- logout clears current user and returns to home
- theme toggle persists to local storage

### 4.2 Footer

Minimal footer with:

- NewsHub brand on the left
- copyright line on the right

It is simple, quiet, and separated by a top border.

### 4.3 News Card

This is the reusable article card used on home and profile favorites.

Structure:

- image area on top, fixed height around `220px`
- fallback visual if image fails
- content area below
- category pill
- article title
- short description
- metadata line

Metadata includes:

- source name
- read time
- published date

Card behavior:

- whole card is clickable
- navigates to `/details/:id`
- passes `category` in query params
- also sends article in navigation state for faster detail loading

### 4.4 Hero Banner

Reusable home page hero with a dark gradient background.

Message changes based on auth state:

- guest: promote signup and future premium AI
- logged-in non-premium: encourage premium upgrade
- premium user: say the premium newsroom is ready

Buttons also change by user state:

- guest: login, register, premium
- logged-in free: profile, unlock premium
- premium: open profile, explore articles

## 5. Home Page

### 5.1 Main composition

The home page order is:

1. header
2. hero banner
3. intro text block
4. preferred interests banner if user has interests
5. category/filter component
6. loading or error or empty state
7. news feed
8. footer

### 5.2 Intro section

Contains:

- small pill label `Smart distribution`
- large title `Latest News`
- supporting copy explaining that category news is preloaded once per refresh and reused for fast filter switching

### 5.3 Preferred interests banner

Only show this if the logged-in user has interests.

Layout:

- left: explanation text
- right: chips for selected favorite categories

Key message:

- favorite categories are prioritized
- preferred categories can show up to 10 articles each
- other categories show 5 articles

Visually:

- warm gradient
- orange-tinted chips
- premium editorial tone

### 5.4 Filter block

This is a major feature on the home page.

Top line:

- small pill label `Feed`
- title `Browse by Category`
- subtitle explaining that category changes reuse preloaded news

Filter interactions:

- row of category chips:
  - All
  - Technology
  - Business
  - Politics
  - Science
  - Entertainment
  - Sports
  - Health
- extra filter controls:
  - country dropdown
  - source dropdown
  - date input
  - data type dropdown

Behavior:

- selecting filters updates the feed
- filter change is lightly debounced
- selected chip appears filled/active

### 5.5 Home feed logic

When category is `all`:

- show the page as **multiple sections**
- preferred categories appear first
- each category section has:
  - section label `Preferred category` or `Category snapshot`
  - category title
  - article count message
  - grid of cards

When category is a specific category:

- show one flat top grid of filtered articles

Loading state text:

- `Loading news from the cached category pool...`

Error state:

- show a card with clear error text

No-result state:

- show a card saying no articles were found

### 5.6 News fetching behavior

Important logic to preserve:

- preload article pools per category
- cache the category pool in memory
- also persist the store in `localStorage`
- if loading fresh news fails, try using cached real articles from local storage
- article list is deduplicated and sorted by newest

The home page should feel fast because it reuses cached category data instead of refetching every change.

## 6. Article Details Page

### 6.1 Main composition

The article details page includes:

- header
- narrow centered content area around 1100px max
- back link to home
- hero metadata panel
- large article image
- article body section
- premium assistant area
- comments area

### 6.2 Article hero block

Show:

- category pill
- source name
- publish date
- read time
- large article title
- byline using the source name
- action buttons

Action buttons:

- `Save Article`
- `Ask Premium AI` if logged-in premium
- `Unlock Premium AI` if logged-in free user
- `Log in for Premium AI` if guest

Save behavior:

- if guest, redirect to login with current page as return URL
- if article lacks a source URL, block save and show message
- toggle saved/unsaved state

### 6.3 Article content block

Show:

- description or article body preview
- button linking to original source in a new tab

Source button label:

- `Voir la source de l'actualite`

### 6.4 Premium assistant gating

If user is logged in and premium:

- show the full article assistant panel

If user is logged in but not premium:

- show a premium lock card explaining chatbot is Premium-only
- include button to premium simulation page

If user is not logged in:

- show a login-gated assistant card
- explain that premium AI requires sign-in and premium activation
- include login CTA

### 6.5 Comments section

Title format:

- `Comments (N)`

Comment behavior:

- if logged in:
  - show textarea
  - allow submitting comment
- if logged out:
  - show login prompt and button

Below that:

- loading state for comments
- list of existing comments

Each comment shows:

- commenter name
- created date/time if available
- comment text

## 7. Premium AI Assistant Panel

This is one of the most important parts of the frontend.

It appears inside the article details page for premium users only.

### 7.1 Purpose

The assistant is an article-aware chat panel that combines:

- article brief generation
- system/runtime health check
- quick prompt actions
- conversation UI
- evidence display for grounded answers

### 7.1.1 AI runtime requirement

The Premium AI feature must be described and built as a **local AI assistant powered by Ollama with `gemma3:12b` as the main generation model**.

Keep these rules explicit in the rebuilt version:

- use local Ollama as the runtime
- use `gemma3:12b` as the preferred generation model
- the assistant status area must check whether `gemma3:12b` is installed, reachable, and ready
- article-grounded answers should still use retrieval/article context, but the final generation model should be `gemma3:12b`
- if `gemma3:12b` is unavailable, show a clear warning state and a recheck action

### 7.2 Top section

Two-column hero layout:

- left: assistant explanation
- right: article context card

Left card:

- eyebrow `Premium AI Desk`
- title `Ask about this story with Premium AI`
- explanation that grounded answers come from the article itself

Right article card:

- status chip `Article context loaded`
- article title
- source name and published date

### 7.3 Runtime status card

Show assistant backend status:

- checking local Ollama / `gemma3:12b` connection
- whether general chat is ready
- whether grounded retrieval is ready
- allow manual recheck button

Text tone:

- clear and technical but friendly

If ready:

- show active model label, ideally `gemma3:12b`
- explain general chat is live and retrieval is ready

If not ready:

- show first issue message
- make it clear that the preferred model is `gemma3:12b`

### 7.4 Article brief cards

Show three cards when brief is loaded:

- `Short Summary`
- `Why It Matters`
- `Key Points`

The brief section should look structured and premium, not like a raw JSON dump.

### 7.5 Signal cards

If available, show chips for:

- people
- organizations
- dates
- important numbers

These should look like compact intelligence tags.

### 7.6 Quick actions

Display rounded quick-action buttons:

- `Summarize this`
- `Why does it matter?`
- `Key facts`
- `Explain simply`
- `Who is involved?`

Clicking one sends a predefined prompt into chat.

### 7.7 Conversation area

Conversation card contains:

- title `Conversation`
- short explanation that grounded replies show article evidence and general replies do not
- small chip saying the last 6 turns are kept in context
- scrollable message stream

Empty state:

- encourage user to start with quick actions
- show suggested question buttons if brief provides them

Chat message behavior:

- user messages aligned right, dark bubble
- assistant messages aligned left, white bubble
- assistant messages show mode pill:
  - `Article-grounded`
  - `General assistant`
- if response is cached, show cached chip

Grounded response extras:

- show evidence items
- each evidence item shows score and supporting text

If limitations exist:

- show first limitation in a highlighted note area

While sending:

- show temporary assistant bubble with `Thinking`

### 7.8 Composer

At bottom of conversation card:

- textarea
- helper hint about grounded vs general mode
- send button

Placeholder:

- `Example: What changed here, and why does it matter?`

Important behavior:

- keep only recent history in request context
- quick actions and suggested questions should directly send a message
- on failure, append a friendly assistant fallback reply and show an error

## 8. Authentication Experience

Auth lives inside a special split-screen card page rather than a plain form page.

### 8.1 Auth shell

Two-column layout:

- left: dark promotional/marketing panel
- right: actual auth form panel

Left panel contents:

- eyebrow changes based on login or signup
- large headline
- explanation paragraph
- 3 benefit cards:
  - Personalized news
  - Premium ready
  - Unified experience

Background:

- dark editorial gradient with subtle amber glow

### 8.2 Login mode

Right panel shows:

- NewsHub brand block
- title `Sign in`
- explanatory copy
- login form

Login form fields:

- email
- password

Features:

- password show/hide toggle
- loading state on submit
- error alert for invalid credentials
- text link to switch to signup

On success:

- set current user in local storage/session state
- navigate to `returnUrl` if present, otherwise home

### 8.3 Signup mode

Signup is a 2-step flow.

Step 1:

- collect:
  - full name
  - email
  - password
  - confirm password
- real-time email availability check
- show validation errors
- password show/hide toggle
- continue button

Step 2:

- interest selection page
- fetch available interests from backend
- display selectable topic boxes
- allow max 3 interests
- show selected count
- back button
- complete button

On complete:

- send full signup payload including interest IDs
- auto-login the returned user
- navigate to `returnUrl`

### 8.4 Auth copy and behavior notes

The auth page should feel more like a polished onboarding/product screen than a standard admin login.

## 9. Profile Page

The profile page is a premium-looking account dashboard.

### 9.1 Layout

Order:

- header
- big profile hero
- two-column profile workspace
- saved articles section
- footer

### 9.2 Hero section

Dark gradient hero with two columns:

- left: marketing-style explanation
- right: personal summary card

Left side contains:

- eyebrow `Premium member space` or `Account workspace`
- large headline `Manage your profile with confidence.`
- explanatory paragraph
- tags such as:
  - Authenticated access
  - Live field validation
  - Secure update flow
  - Premium available or Chatbot unlocked

Right summary card contains:

- initials avatar
- full name
- email
- three stats:
  - profile completion
  - saved article count
  - membership tier

### 9.3 Profile form panel

Main editor panel contains:

- section kicker
- heading `Profile information`
- status pill `Loading`, `Saving`, or `Ready`
- warning/success/error banners when needed

Form fields:

- first name
- last name
- email

Security subsection:

- current password
- new password
- confirm password

Validation rules:

- first and last name minimum 2 chars
- valid email required
- new password minimum 8 chars
- if current password exists, new password is required
- if new password exists, current password is required
- new password must match confirm password

Buttons:

- `Reset`
- `Save changes`

Behavior:

- preload with current user data
- split full name into first and last name
- submit updates profile through backend
- on success, refresh current user session and show success banner

### 9.4 Side cards

Right column contains:

- membership card with CTA to premium simulation
- exception handling / safe feedback informational card

### 9.5 Saved articles section

Bottom section title:

- `Saved articles`

Show:

- count text
- loading state card
- empty state card
- grid of saved article cards

This section reuses the same `NewsCard` component as the home page.

## 10. Premium Page

This page simulates payment and premium activation.

### 10.1 Purpose

The premium page is intentionally a **fake checkout flow** used to unlock premium features in local project mode.

### 10.2 Layout

Order:

- header
- premium hero
- two-column content section
- footer

### 10.3 Premium hero

Two-column dark gradient hero:

- left: explanation of premium simulation
- right: current membership status card

Left content:

- eyebrow `Premium simulation`
- title `Unlock the NewsHub chatbot for premium readers.`
- explanation that checkout is simulated and no real gateway is used
- tags:
  - Fake payment flow
  - Instant premium activation
  - Assistant reserved for premium accounts

Right membership card:

- shows current status for guest, standard, or premium
- shows date and plan if already premium
- status strip with visual variation for active premium, standard, or guest
- CTA changes:
  - guest -> sign in
  - premium -> continue to app

### 10.4 Plan selection

Two selectable cards:

- monthly
- annual

Each card contains:

- plan badge
- plan name
- display-only price
- billing text
- highlight line
- features list

When selected:

- card gets accent border and elevated look

Plans:

- Monthly: quick unlock
- Annual: recommended / best value

### 10.5 Checkout panel

Show:

- selected plan dropdown
- cardholder name
- card number
- expiry
- CVC
- terms acknowledgment checkbox
- summary card
- action buttons

Validation:

- required fields
- cardholder minimum 3 chars
- card number minimum 16 chars
- expiry minimum 5 chars
- cvc minimum 3 chars
- terms must be accepted

Submit behavior:

- if guest, redirect to login
- otherwise simulate a delay
- mark current user as premium locally
- generate a fake receipt reference
- show success message

Buttons:

- `Back to profile`
- `Simulate payment`

### 10.6 Premium storage behavior

Premium status is stored locally per user in `localStorage`, separate from base user profile.

Persist:

- plan
- premiumSince date
- last four digits of card number

## 11. Functional Rules to Preserve

### 11.1 User session

Current user is stored in `localStorage`.

Auth service decorates the user with premium membership data before exposing session state.

### 11.2 Return URL handling

When login is required from a protected action:

- redirect to login
- include `returnUrl`
- after success return the user to the prior page

Used especially for:

- save article
- comments
- premium assistant access
- profile access
- premium page access

### 11.3 Favorites

Logged-in users can save and unsave articles.

Rules:

- article must have a valid source URL
- saved state is loaded when detail page opens
- favorites appear in profile page saved articles section

### 11.4 Comments

Logged-in users can post comments on an article.

Rules:

- guests are prompted to log in
- empty comments are blocked
- comments refresh after successful post

### 11.5 Personalized feed

If a user has interests:

- use up to 3 preferred categories
- order category sections with preferred ones first
- preferred categories show more articles than non-preferred categories

### 11.6 Premium AI access

Only logged-in premium users see the real assistant panel.

Logged-in free users see an upsell/lock card.

Guests see a login prompt card.

## 12. API and Data Contract Expectations

Use frontend services that match these behaviors.

### 12.1 News service

Needs article objects with this shape:

- `id`
- `title`
- `description`
- `content`
- `imageUrl`
- `sourceName`
- `publishedAt`
- `readTime`
- `url`
- `category`
- optional `sourceDomain`
- optional `sourceId`
- optional `countries`
- optional `dataType`
- optional `matchedCategories`

The home feed logic expects:

- a preloaded store of articles by category
- filtering by:
  - category
  - country
  - source
  - date
  - data type

### 12.2 Auth endpoints

Current frontend uses:

- `POST /login`
- `GET /check-email/:email`
- `GET /interests`
- `POST /complete-signup`

### 12.3 Favorites endpoints

Current frontend uses:

- `POST /favorites`
- `DELETE /favorites`
- `GET /favorites-status`
- `GET /favorites/:userId`

### 12.4 Comments endpoints

Current frontend uses:

- `GET /comments?article_url=...`
- `POST /comments`

### 12.5 Profile endpoints

Current frontend uses:

- `GET /users/:id`
- `PUT /users/:id/profile`

### 12.6 Chatbot endpoints

Current frontend uses:

- `GET /chatbot/status`
- `POST /chatbot/article-brief`
- `POST /chatbot/ask`

The rebuilt frontend should assume the chatbot status payload can expose:

- preferred generation model = `gemma3:12b`
- active generation model
- connection state
- retrieval readiness
- article brief readiness
- issues list

## 13. Exact UX Characteristics to Keep

When recreating the interface, keep these details:

- sticky translucent header
- dark hero sections with radial gradient glows
- white cards on soft gray background
- many rounded corners, usually between `14px` and `24px`
- orange gradient CTAs for Premium and key actions
- strong but clean editorial headings
- filter chips and pills everywhere
- premium assistant displayed as a polished intelligence workspace, not a plain chatbot
- profile page should feel like a dashboard, not a basic form
- auth page should feel like onboarding, not a generic login modal
- premium page should feel like a fake checkout landing page

## 14. Ready-to-Use Build Prompt

If you want a single prompt to give another AI, use this:

```text
Recreate a frontend called NewsHub as a modern Angular single-page news platform with the same interface, same user flows, and same functionality described below.

The app must include these routes:
- / home page
- /profile profile dashboard
- /premium premium simulation page
- /details/:id article details page
- /login auth page in login mode
- /register auth page in signup mode

Design style:
- editorial SaaS look
- light gray page background
- white rounded cards
- soft borders and shadows
- sticky blurred header
- very large bold headings
- dark gradient heroes with radial glow accents
- orange gradient CTA buttons
- Inter font
- optional dark mode toggle in header with localStorage persistence
- max width around 1240px

Header:
- NewsHub logo on the left
- theme toggle on the right
- if guest: Premium, Login, Register
- if logged in: Go Premium if not premium, plus profile pill dropdown
- profile dropdown shows name, email, membership chip, profile link, premium link, logout

Home page:
- header
- dark hero banner with different text/buttons depending on guest, free user, or premium user
- intro block with Smart distribution label, Latest News title, and caching explanation
- preferred interests banner if user has interests
- category filter section with category chips plus country/source/date/data type filters
- loading, error, and empty states
- if category=all: show sections per category, preferred ones first, each with heading and article count
- if category is specific: show a normal article grid
- article cards must show image, category pill, title, description, source, read time, and date
- clicking a card opens /details/:id and passes category and article state

Article details page:
- centered narrow layout
- back link to home
- metadata row with category, source, date, read time
- large title
- save article button
- premium AI action button that changes by auth/premium state
- large article image
- body copy card with source link button
- if premium and logged in: show full AI assistant panel
- if logged in but not premium: show premium lock card with upgrade CTA
- if guest: show login CTA for premium AI
- comments section with comment count, textarea for logged-in users, login prompt for guests, and list of comments

Premium AI assistant:
- premium-only component inside article details page
- two-column intro with Premium AI Desk copy and article context card
- runtime status card showing local AI readiness and `gemma3:12b` model status through Ollama
- brief cards for Short Summary, Why It Matters, Key Points
- optional chip cards for people, organizations, dates, numbers
- rounded quick-action buttons
- polished conversation area with left assistant bubbles and right user bubbles
- grounded replies can show evidence items and limitations
- composer textarea and send button at bottom
- keep only recent turns in request context

Authentication page:
- full-page split layout
- left side is a dark editorial marketing panel
- right side is the auth form panel
- login mode with email/password and show/hide password
- signup mode is a two-step flow:
  1. collect full name, email, password, confirm password, with email availability check
  2. choose up to 3 interests from backend-loaded list
- successful signup auto-logs the user in
- support returnUrl navigation

Profile page:
- dark premium-style hero with intro copy on left and user summary card on right
- stats for profile completion, saved articles, and membership tier
- main profile form with first name, last name, email
- optional password change section with validation
- success/error/warning banners
- side cards for membership and validation feedback
- saved articles section at the bottom using the same news cards

Premium page:
- dark hero explaining premium simulation
- membership status card on the right
- selectable monthly and annual plan cards
- simulated checkout form with plan, cardholder, card number, expiry, cvc, checkbox, and summary
- submit should simulate payment and mark current user as premium locally
- generate fake receipt reference

Functional requirements:
- store current user in localStorage
- store premium membership separately in localStorage and decorate the user session with it
- support returnUrl redirects after login
- allow logged-in users to save/unsave articles
- allow logged-in users to post comments
- personalize home feed using up to 3 preferred categories
- premium assistant must be visible only to logged-in premium users
- premium assistant generation must target local Ollama with `gemma3:12b` as the preferred model
- preload news by category and reuse cached article data for fast filter changes

Use Angular standalone components, Angular Router, Angular forms/reactive forms, RxJS, and custom CSS with Bootstrap available where useful. Match the existing interface closely in layout, spacing, color direction, component hierarchy, and behavior.
```

## 15. Implementation Notes

If another AI rebuilds this UI, it should prioritize:

- matching layout and page composition first
- matching states and gating logic second
- matching styling details third
- matching API/service contracts fourth

The most important screens to get right are:

1. Home page
2. Article details page with Premium AI assistant
3. Auth screen
4. Profile dashboard
5. Premium simulation checkout
