// The 78 blueprints from the design handoff (Blueprints.html): starting points with a name, a category
// and a one-line job. Nothing is built behind them: Build from this opens New agent with the name, the
// category as its role and the job as what the agent is for. Five do the same job as one of the
// backend's role templates (templateId); for those, New agent also offers that template's
// instructions and suggested skills. No runtime imports, so node tests can load it.

export const BLUEPRINT_CATEGORIES = ["Sales","Marketing","Research","Product and engineering","Design and media","Operations","People","Personal"] as const;

export type BlueprintCategory = (typeof BLUEPRINT_CATEGORIES)[number];

export type Blueprint = { id: string; name: string; category: BlueprintCategory; job: string; templateId?: string };

export const BLUEPRINTS: readonly Blueprint[] = [
  {
    id: "prospect-finder",
    name: "Prospect Finder",
    category: "Sales",
    job: "Finds people who match your ideal customer and drafts a first message to each."
  },
  {
    id: "loose-ends",
    name: "Loose Ends",
    category: "Sales",
    job: "Chases open follow-ups after calls and meetings until each one is closed."
  },
  {
    id: "call-scorecard",
    name: "Call Scorecard",
    category: "Sales",
    job: "Scores a sales call and says what to fix before the next one."
  },
  {
    id: "full-cycle-seller",
    name: "Full-Cycle Seller",
    category: "Sales",
    job: "Works the customer journey from outreach to renewal, drafting everything for approval."
  },
  {
    id: "cadence-runner",
    name: "Cadence Runner",
    category: "Sales",
    job: "Runs outbound sequences and stages each draft for you to send."
  },
  {
    id: "account-review-builder",
    name: "Account Review Builder",
    category: "Sales",
    job: "Builds a business review deck for a named account from CRM and call history."
  },
  {
    id: "intent-spotter",
    name: "Intent Spotter",
    category: "Sales",
    job: "Ranks accounts that just showed buying intent and drafts the first touch."
  },
  {
    id: "after-call-writer",
    name: "After-Call Writer",
    category: "Sales",
    job: "Turns a recorded call into a follow-up email, next steps and CRM updates."
  },
  {
    id: "hiring-radar",
    name: "Hiring Radar",
    category: "Sales",
    job: "Watches target accounts for hiring activity that signals a need."
  },
  {
    id: "warm-path-finder",
    name: "Warm Path Finder",
    category: "Sales",
    job: "Finds who you already know at a target account."
  },
  {
    id: "forecast-check",
    name: "Forecast Check",
    category: "Sales",
    job: "Scans the pipeline for stale deals, forecast risk and CRM gaps."
  },
  {
    id: "deal-gatekeeper",
    name: "Deal Gatekeeper",
    category: "Sales",
    job: "Checks each deal against your qualification criteria using call evidence."
  },
  {
    id: "list-builder",
    name: "List Builder",
    category: "Sales",
    job: "Turns an ideal customer profile into a focused prospect list with context."
  },
  {
    id: "account-briefer",
    name: "Account Briefer",
    category: "Sales",
    job: "Researches a target account before outreach."
  },
  {
    id: "pre-call-brief",
    name: "Pre-Call Brief",
    category: "Sales",
    job: "Writes the pre-call brief and account plan for the companies you sell to."
  },
  {
    id: "phone-runner",
    name: "Phone Runner",
    category: "Sales",
    job: "Places outbound phone calls on request and reports what happened."
  },
  {
    id: "call-prep-coach",
    name: "Call Prep Coach",
    category: "Sales",
    job: "Briefs you before customer calls and coaches you after."
  },
  {
    id: "partner-call-coach",
    name: "Partner Call Coach",
    category: "Sales",
    job: "Coaches you on partnership calls."
  },
  {
    id: "lead-sorter",
    name: "Lead Sorter",
    category: "Sales",
    job: "Scores inbound leads, merges duplicates and assigns an owner."
  },
  {
    id: "proof-writer",
    name: "Proof Writer",
    category: "Sales",
    job: "Turns call notes into case studies and testimonials, with quotes kept word for word."
  },
  {
    id: "deck-coach",
    name: "Deck Coach",
    category: "Sales",
    job: "Reviews a pitch deck and says what to strengthen."
  },
  {
    id: "search-brief-desk",
    name: "Search Brief Desk",
    category: "Marketing",
    job: "Turns keywords into content ideas and writer-ready briefs."
  },
  {
    id: "plain-voice-editor",
    name: "Plain Voice Editor",
    category: "Marketing",
    job: "Rewrites drafts so they read like a person wrote them, showing every change.",
    templateId: "writing-plainer"
  },
  {
    id: "answer-engine-check",
    name: "Answer Engine Check",
    category: "Marketing",
    job: "Checks whether AI assistants and search recommend you, and who they name instead."
  },
  {
    id: "campaign-loop",
    name: "Campaign Loop",
    category: "Marketing",
    job: "Runs campaigns, creative, channel analysis and outbound, and asks before spending or posting."
  },
  {
    id: "marketing-conductor",
    name: "Marketing Conductor",
    category: "Marketing",
    job: "Coordinates research, positioning, pages, ads and analytics across specialist agents."
  },
  {
    id: "ad-performance-analyst",
    name: "Ad Performance Analyst",
    category: "Marketing",
    job: "Turns ad exports into weekly and monthly reports and watches spend against limits."
  },
  {
    id: "paid-growth-lead",
    name: "Paid Growth Lead",
    category: "Marketing",
    job: "Plans and manages paid campaigns."
  },
  {
    id: "site-keeper",
    name: "Site Keeper",
    category: "Marketing",
    job: "Ships website changes for review and runs evidence-backed site audits."
  },
  {
    id: "positioning-writer",
    name: "Positioning Writer",
    category: "Marketing",
    job: "Learns your product and tone, then drafts copy that sharpens how you stand out."
  },
  {
    id: "app-ads-review",
    name: "App Ads Review",
    category: "Marketing",
    job: "Reviews app-store ad spend against your cost target and drafts the changes."
  },
  {
    id: "weekly-ads-report",
    name: "Weekly Ads Report",
    category: "Marketing",
    job: "Combines ad platform exports into one weekly report with commentary."
  },
  {
    id: "budget-guard",
    name: "Budget Guard",
    category: "Marketing",
    job: "Watches ad spend and flags what is breaking before it burns budget."
  },
  {
    id: "mention-monitor",
    name: "Mention Monitor",
    category: "Marketing",
    job: "Watches forums, news and social for mentions of your brand and sends a short digest."
  },
  {
    id: "social-brief",
    name: "Social Brief",
    category: "Marketing",
    job: "Turns the accounts and topics you pick into one short daily brief."
  },
  {
    id: "site-health-audit",
    name: "Site Health Audit",
    category: "Marketing",
    job: "Audits a website and lists what to fix."
  },
  {
    id: "site-and-newsletter-admin",
    name: "Site and Newsletter Admin",
    category: "Marketing",
    job: "Keeps a site, a public dashboard and newsletter sends running."
  },
  {
    id: "event-ask-triage",
    name: "Event Ask Triage",
    category: "Marketing",
    job: "Scores every event, sponsorship and speaking request, then drafts your yes or no."
  },
  {
    id: "run-of-show-planner",
    name: "Run-of-Show Planner",
    category: "Marketing",
    job: "Turns event details into a run of show, guest list and day-of checklist."
  },
  {
    id: "hospitality-planner",
    name: "Hospitality Planner",
    category: "Marketing",
    job: "Keeps the plan and status clean for hosted events and ticket allocations."
  },
  {
    id: "deep-researcher",
    name: "Deep Researcher",
    category: "Research",
    job: "Researches a question in depth and reports back with sources.",
    templateId: "everyday-digger"
  },
  {
    id: "market-watch",
    name: "Market Watch",
    category: "Research",
    job: "Monitors competitors' sites, ads, pricing and positioning on a standing cadence."
  },
  {
    id: "competitor-shadow",
    name: "Competitor Shadow",
    category: "Research",
    job: "Signs up for competitors' products and newsletters and reports what changed."
  },
  {
    id: "rival-tracker",
    name: "Rival Tracker",
    category: "Research",
    job: "Tracks named competitors and flags their moves."
  },
  {
    id: "idea-pressure-test",
    name: "Idea Pressure Test",
    category: "Research",
    job: "Stress-tests a product idea before you build it."
  },
  {
    id: "docs-answer-desk",
    name: "Docs Answer Desk",
    category: "Research",
    job: "Answers how-to questions from your docs and always cites the source."
  },
  {
    id: "release-checker",
    name: "Release Checker",
    category: "Product and engineering",
    job: "Runs the acceptance checklist on a live deploy and says pass or fail."
  },
  {
    id: "daily-product-walker",
    name: "Daily Product Walker",
    category: "Product and engineering",
    job: "Walks your product every weekday in a test account and reports what broke."
  },
  {
    id: "scope-writer",
    name: "Scope Writer",
    category: "Product and engineering",
    job: "Writes what is in, what is out and how you will know it is done."
  },
  {
    id: "build-supervisor",
    name: "Build Supervisor",
    category: "Product and engineering",
    job: "Boards work, launches coding agents and only asks you to merge."
  },
  {
    id: "tech-lead",
    name: "Tech Lead",
    category: "Product and engineering",
    job: "Leads engineering work across a team of agents."
  },
  {
    id: "prototype-maker",
    name: "Prototype Maker",
    category: "Product and engineering",
    job: "Turns ideas into shareable prototypes as draft changes with screenshots."
  },
  {
    id: "overnight-auditor",
    name: "Overnight Auditor",
    category: "Product and engineering",
    job: "Audits the codebase overnight and reports what it found."
  },
  {
    id: "software-engineer",
    name: "Software Engineer",
    category: "Product and engineering",
    job: "Writes code, triages issues and monitors production."
  },
  {
    id: "support-reply-drafter",
    name: "Support Reply Drafter",
    category: "Product and engineering",
    job: "Drafts answers to customer product questions for your review."
  },
  {
    id: "project-board-runner",
    name: "Project Board Runner",
    category: "Product and engineering",
    job: "Runs projects from a board: one row per project and tasks specialists claim."
  },
  {
    id: "frame-puller",
    name: "Frame Puller",
    category: "Design and media",
    job: "Pulls stills, thumbnails and short clips out of footage, sized for where they go."
  },
  {
    id: "design-spec-writer",
    name: "Design Spec Writer",
    category: "Design and media",
    job: "Turns a design frame into a build spec and audits components and tokens."
  },
  {
    id: "design-reviewer",
    name: "Design Reviewer",
    category: "Design and media",
    job: "Turns a screenshot into a critique with ranked, concrete fixes.",
    templateId: "design-critique"
  },
  {
    id: "game-art-lead",
    name: "Game Art Lead",
    category: "Design and media",
    job: "Turns a game concept into a style guide, palettes and prompt sheets."
  },
  {
    id: "highlight-cutter",
    name: "Highlight Cutter",
    category: "Design and media",
    job: "Finds the best moments in a long recording and cuts captioned clips."
  },
  {
    id: "video-director",
    name: "Video Director",
    category: "Design and media",
    job: "Turns a brief into a planned, shot and cut video."
  },
  {
    id: "talking-head-editor",
    name: "Talking-Head Editor",
    category: "Design and media",
    job: "Edits short vertical videos from raw footage after you approve the plan."
  },
  {
    id: "export-desk",
    name: "Export Desk",
    category: "Design and media",
    job: "Turns footage into cut clips, captions and platform-sized exports."
  },
  {
    id: "recap-deck-maker",
    name: "Recap Deck Maker",
    category: "Design and media",
    job: "Turns meeting notes into a recap deck in your slide style."
  },
  {
    id: "revision-partner",
    name: "Revision Partner",
    category: "Design and media",
    job: "Drafts and revises prose while keeping your meaning, facts and voice.",
    templateId: "writing-draftsman"
  },
  {
    id: "spend-trimmer",
    name: "Spend Trimmer",
    category: "Operations",
    job: "Inventories software spend, finds savings and drafts vendor counters."
  },
  {
    id: "exec-desk",
    name: "Exec Desk",
    category: "Operations",
    job: "Handles executive support: rooms, prep, outreach and calendar checks."
  },
  {
    id: "office-desk",
    name: "Office Desk",
    category: "Operations",
    job: "Handles office operations requests."
  },
  {
    id: "agent-designer",
    name: "Agent Designer",
    category: "Operations",
    job: "Asks a few questions, then designs a tight single-purpose agent."
  },
  {
    id: "team-architect",
    name: "Team Architect",
    category: "Operations",
    job: "Audits your agent team for clear owners and no duplicate jobs."
  },
  {
    id: "setup-importer",
    name: "Setup Importer",
    category: "Operations",
    job: "Brings your setup over from other AI tools and proposes the agents to cover it."
  },
  {
    id: "interview-scheduler",
    name: "Interview Scheduler",
    category: "People",
    job: "Schedules interview loops, preps interviewers and chases what is stalled."
  },
  {
    id: "candidate-finder",
    name: "Candidate Finder",
    category: "People",
    job: "Finds candidates for open roles who are not already in your system."
  },
  {
    id: "home-inbox-minder",
    name: "Home Inbox Minder",
    category: "Personal",
    job: "Watches personal email and calendar so forms, bills and RSVPs do not slip."
  },
  {
    id: "morning-paper",
    name: "Morning Paper",
    category: "Personal",
    job: "Lays out your day from email and calendar as a personal newspaper."
  },
  {
    id: "card-picker",
    name: "Card Picker",
    category: "Personal",
    job: "Says which card to use for a purchase and tracks credits and perks."
  },
  {
    id: "plant-journal",
    name: "Plant Journal",
    category: "Personal",
    job: "Keeps a houseplant care log with weekly reminders.",
    templateId: "personal-greenhouse"
  }
];

/** Blueprints matching a search and a category (null: all). Every word must appear in name, job or category. */
export function filterBlueprints(list: readonly Blueprint[], query: string, category: BlueprintCategory | null): Blueprint[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((item) => {
    if (category && item.category !== category) return false;
    const text = `${item.name} ${item.job} ${item.category}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

export function blueprintById(id: string | null | undefined): Blueprint | null {
  return BLUEPRINTS.find((item) => item.id === id) ?? null;
}
