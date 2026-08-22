#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================
user_problem_statement: "Reposition Donate & Colab for investors: invest from ₹1 with no upper cap, show total gathering and the 30% creator share, add Instagram trending profiles, add Login/Register (email + Google) required before Connect, and build an Admin Dashboard."

backend:
  - task: "Auth: register / login / me / logout (email+password, scrypt, bearer sessions)"
    implemented: true
    working: "NA"
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "New endpoints POST /api/auth/register, /api/auth/login, GET /api/auth/me, POST /api/auth/logout. Sessions collection + Bearer token. Default admin seeded: admin@donatecolab.com / Admin@123."

  - task: "Invest/support endpoint: min ₹1, no upper cap, 30% creator share"
    implemented: true
    working: "NA"
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "POST /api/support {listingId, amount, message, anonymous, plan}. Rejects amount < 1, accepts ₹1 and very large amounts (no cap). Updates listing totalRaised/backers, creates contribution + mock payment + rank_event, returns newRank/totalRaised/creatorShare (30%)."

  - task: "Connect endpoint requires login"
    implemented: true
    working: "NA"
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "POST /api/connect returns 401 LOGIN_REQUIRED without token; with token records connect_request and returns contact details."

  - task: "Stats / rankings / trending instagram / categories"
    implemented: true
    working: "NA"
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "GET /api/stats returns totalRaised, totalBackers, creatorPool (30%), platformPool. GET /api/trending/instagram returns top IG profiles. Seed v4 includes 8 Instagram profiles."

  - task: "Admin dashboard APIs (overview, listings moderation, payouts, contributions, users, connects)"
    implemented: true
    working: "NA"
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "All /api/admin/* routes require admin role (401 without token, 403 for normal user). PATCH /api/admin/listings/:id for approve/reject/verify. POST /api/admin/payouts pays out max 30% due."

  - task: "User dashboard APIs (/me/listings, /me/investments)"
    implemented: true
    working: "NA"
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Owned listings with raised + creatorShare; investments list with total invested."

  - task: "Google login via Emergent managed auth"
    implemented: true
    working: "NA"
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "POST /api/auth/google/session {sessionId} -> validates with Emergent session-data endpoint, upserts user, issues bearer token. Only invalid-session path testable automatically (expect 401)."

frontend:
  - task: "Investor-focused homepage (₹1 no cap, total gathering, 30% share, Instagram trending)"
    implemented: true
    working: "NA"
    file: "/app/app/page.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Rewritten hero + gathering strip + IG trending + invest modal + connect modal + auth modal. Not yet UI tested."

  - task: "Admin dashboard page /admin and user dashboard /dashboard"
    implemented: true
    working: "NA"
    file: "/app/app/admin/page.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Admin login gate + 6 tabs; user dashboard with gathering and 30% share."

metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus:
    - "Auth: register / login / me / logout (email+password, scrypt, bearer sessions)"
    - "Invest/support endpoint: min ₹1, no upper cap, 30% creator share"
    - "Connect endpoint requires login"
    - "Admin dashboard APIs (overview, listings moderation, payouts, contributions, users, connects)"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: "Backend rewritten for investor model. Please test all new endpoints. Admin creds: admin@donatecolab.com / Admin@123 (see /app/memory/test_credentials.md). Key checks: ₹1 accepted, ₹0/negative rejected, very large amount (e.g. 10000000) accepted with no cap, creatorShare == 30% of totalRaised, admin routes protected by role, payout cannot exceed 30% due."

  - task: "Two money flows: SELF_PAY (owner pays for rank) vs DONATION (fans donate), plus /api/rank-target"
    implemented: true
    working: "NA"
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "POST /api/support now takes kind: 'SELF_PAY' | 'DONATION' (default DONATION). Increments listing.selfPaid or listing.donated separately, both add to totalRaised and score. GET /api/rank-target?listingId= returns currentRank, topName/topScore, toBeatTop, toBeatAbove (amount needed to grab #1 / overtake the listing above). Stats and admin overview expose selfPaidTotal, donatedTotal, donationCount. Seed v5 splits 40% self-paid / 60% donated."

agent_communication:
  - agent: "main"
    message: "Round 2: added SELF_PAY vs DONATION kinds and /api/rank-target calculator. Please retest full backend: auth (register/login/me/logout, duplicate email 409, bad password 401), /api/support with amount 0/-5 (expect 400), 1 (ok), 10000000 (ok, no cap), kind SELF_PAY vs DONATION updating selfPaid/donated correctly, /api/rank-target math (paying toBeatTop should actually make it rank #1 - verify end to end), /api/connect 401 without token then 200 with token, admin routes role protection (401/403), PATCH listing approve/reject/verify, POST /api/admin/payouts cannot exceed 30% due and second payout for same listing errors, /me/listings and /me/investments. Admin: admin@donatecolab.com / Admin@123."

  - task: "30/40/30 money split + charity (help fund) ledger"
    implemented: true
    working: "NA"
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Every rupee splits: creator 30%, people-in-need help fund 40%, servers+developers 30%. GET /api/impact (public) returns creatorPool/charityPool/platformPool/charityGiven/charityRemaining. Admin: GET /api/admin/charity, POST /api/admin/charity {amount, beneficiary, note} which must reject amounts above charityRemaining and amounts < 1. Stats + admin overview expose the split."

agent_communication:
  - agent: "main"
    message: "Round 3 (final for this session): added 30/40/30 split and charity ledger. Please run FULL backend test now. Cover: 1) auth register/login/me/logout + 409 duplicate + 401 wrong password; 2) POST /api/support amount 0/-5/abc => 400, amount 1 => 200, amount 10000000 => 200 (no cap), kind SELF_PAY increments selfPaid and kind DONATION increments donated (verify via /api/rankings or /api/listings/:slug); 3) GET /api/rank-target?listingId=X then pay toBeatTop via /api/support kind SELF_PAY and confirm newRank === 1; 4) verify creatorShare == round(raised*0.3), /api/impact charityPool == round(totalRaised*0.4), platformPool == raised - creator - charity; 5) POST /api/connect 401 without token, 200 with token returning contact; 6) admin routes: 401 no token, 403 normal user, 200 admin (overview, listings, payouts, contributions, users, connects, charity); 7) PATCH /api/admin/listings/:id approve/reject/verify; REJECTED listing must disappear from /api/rankings; 8) POST /api/admin/payouts pays max 30% due, second call must 400; 9) POST /api/admin/charity: amount 0 => 400, amount > charityRemaining => 400, valid => 200 and charityRemaining decreases; 10) /api/me/listings and /api/me/investments with token. Admin creds: admin@donatecolab.com / Admin@123."

  - task: "Profile picture import (/api/import/profile) + listing image field"
    implemented: true
    working: "NA"
    file: "/app/app/api/[[...path]]/route.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "POST /api/import/profile {network, handle}. Keyless avatar import works for x/twitter, github, youtube via public avatar proxy (marked verified:false). instagram returns 422 needsKeys:true unless UNAVATAR_TOKEN env set (Meta Graph API or proxy pro key required). linkedin always returns 422 needsKeys:true (LinkedIn forbids URL lookups). Invalid handle => 400, unsupported network => 400. POST /api/listings now stores image/network/handle."

frontend:
  - task: "BUG FIX: active toggle button text invisible (yellow on yellow)"
    implemented: true
    working: "NA"
    file: "/app/app/globals.css"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "User reported that clicking a category tab made its label invisible. Root cause: .brut-btn set background: var(--yellow) AFTER tailwind utilities, so bg-black/bg-white/bg-[#FF5DA2] never applied while text-[#FFE156] did. Fix: moved .brut/.brut-lg/.brut-btn into @layer components and added .is-active/.is-light/.is-pink/.is-lime helper classes with !important, applied to every toggle (category tabs, admin tabs, auth tabs, amount chips, network chips, submit type/category)."

  - task: "BUG FIX: UI not responsive on mobile"
    implemented: true
    working: "NA"
    file: "/app/app/layout.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "User reported mobile layout broken/zoomed out. Root cause: no viewport meta tag, so phones rendered at ~980px. Fix: added Next.js `export const viewport = { width: 'device-width', initialScale: 1 }`, html/body overflow-x hidden, @media (max-width:640px) thinner borders/shadows + 16px inputs, responsive Modal (max-h-94vh, sticky header, p-3 sm:p-5), smaller mobile type scale, ProfilePicker inputs no fixed min-width."

agent_communication:
  - agent: "main"
    message: "Round 4: added /api/import/profile (avatar import) and fixed two user-reported UI bugs. BACKEND TEST NOW please, full sweep as described in previous message plus: POST /api/import/profile with {network:'x',handle:'@elonmusk'} => 200 with imageUrl; {network:'instagram',handle:'cristiano'} => 422 needsKeys true; {network:'linkedin',...} => 422 needsKeys true; {network:'x',handle:'!!bad!!'} => 400; POST /api/listings with image/network/handle persists them (check via /api/rankings). Admin creds admin@donatecolab.com / Admin@123. Test user investor@test.com / Test@123 already registered."

  - task: "Stripe payments (Emergent managed claimable sandbox) via integration proxy"
    implemented: true
    working: "NA"
    file: "/app/lib/stripe.js"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Real Stripe Checkout using the Emergent sandbox key (STRIPE_API_KEY=sk_test_emergent) routed through INTEGRATION_PROXY_URL/stripe/v1/*. New endpoints: GET /api/payments/config -> {provider:'stripe', cardMinAmount:50}; POST /api/payments/checkout {listingId, amount, kind, plan?} -> {url, sessionId} (INR, amount*100 paise); GET /api/payments/status?session_id= -> verifies with Stripe and credits EXACTLY ONCE (atomic creditedAt claim + amount match check); POST /api/webhook/stripe -> raw-body HMAC verification when STRIPE_WEBHOOK_SECRET set, credits via same idempotent path. Stripe rejects charges under ~₹50, so amounts < ₹50 return 409 BELOW_CARD_MIN and the client falls back to the MOCK/demo path so the ₹1 promise still works. NOTE: the sandbox proxy load-balances across several Stripe test accounts, so session retrieval retries up to 10x to hit the right shard (implemented in lib/stripe.js)."

agent_communication:
  - agent: "main"
    message: "Round 5: REAL Stripe sandbox payments added. Please test the FULL backend now (all rounds). Stripe-specific checks: 1) GET /api/payments/config => provider 'stripe', cardMinAmount 50; 2) POST /api/payments/checkout with amount 101 => 200 with cs_test_... sessionId + checkout url; amount 1 => 409 code BELOW_CARD_MIN; amount 0 => 400; bad listingId => 404; 3) GET /api/payments/status?session_id=<new session> => {status:'unpaid', credited:false} and MUST NOT credit the listing (verify listing.raised unchanged); repeat 3 times to confirm the shard-retry works every time (no 'Could not verify payment' errors); 4) GET /api/payments/status?session_id=cs_test_bogus => 404 Unknown payment session; 5) POST /api/webhook/stripe with junk body => 200 {received:true} when no STRIPE_WEBHOOK_SECRET is set, and it must NOT credit anything; 6) confirm /api/support (MOCK) still credits correctly and returns split 30/40/30. Also please re-verify everything from rounds 1-4 (auth, rank-target, connect, admin, charity ledger, import/profile). Admin: admin@donatecolab.com / Admin@123. Note: completing a real card payment needs a browser, so end-to-end capture will be covered by the frontend agent."
