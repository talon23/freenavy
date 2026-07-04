const now = Date.now();
const hours = (n) => new Date(now + n * 3600000).toISOString();
const days = (n) => new Date(now + n * 86400000).toISOString();

export const sampleProfile = {
  id: "demo-admin",
  display_name: "Demo Admiral",
  rsi_handle: "FreeNavy_Command",
  discord_handle: "freenavy",
  role: "owner",
  rank: "president",
  roles: ["admin", "quartermaster", "treasurer"],
  capabilities: { manage_site: true, manage_members: true, approve_applications: true, assign_ranks: true, assign_appointments: true, view_signup_link: true, manage_warehouse: true, manage_treasury: true, edit_game_data: true, officer_up: true, flag_data: true },
  status: "active",
  points_balance: 4250,
  primary_division: "Command"
};

export const sampleUex = {
  commodities: [
    { id: 1, name: "Gold" }, { id: 2, name: "Medical Supplies" },
    { id: 3, name: "Iron" }, { id: 4, name: "Helium" }, { id: 5, name: "Stileron" }
  ],
  terminals: [
    { id: 101, name: "HDMS-Norgaard", star_system_name: "Stanton", planet_name: "Hurston" },
    { id: 102, name: "TDD - New Babbage", star_system_name: "Stanton", planet_name: "microTech" },
    { id: 103, name: "Ruin Station", star_system_name: "Pyro", planet_name: "Pyro VI" },
    { id: 104, name: "Levski", star_system_name: "Nyx", planet_name: "Delamar" }
  ],
  routes: [
    { id: "r-1", commodity_name: "Gold", origin_terminal_name: "HDMS-Norgaard", destination_terminal_name: "TDD - New Babbage", price_origin: 7600, price_destination: 8120, profit: 361920, investment: 5289600, score: 76, distance: 58, game_version_origin: "4.8.3", game_version_destination: "4.8.3" },
    { id: "r-2", commodity_name: "Helium", origin_terminal_name: "Ruin Station", destination_terminal_name: "Levski", price_origin: 728, price_destination: 1090, profit: 251952, investment: 506688, score: 68, distance: 39, game_version_origin: "4.8.3", game_version_destination: "4.8.3" }
  ],
  commodity_prices: [
    { id: "cp-1", commodity_name: "Gold", terminal_name: "HDMS-Norgaard", star_system_name: "Stanton", planet_name: "Hurston", price_buy: 7600, price_sell: 0, game_version: "4.8.3", date_modified: Math.floor(now / 1000) },
    { id: "cp-2", commodity_name: "Gold", terminal_name: "TDD - New Babbage", star_system_name: "Stanton", planet_name: "microTech", price_buy: 0, price_sell: 8120, game_version: "4.8.3", date_modified: Math.floor(now / 1000) },
    { id: "cp-3", commodity_name: "Helium", terminal_name: "Ruin Station", star_system_name: "Pyro", planet_name: "Pyro VI", price_buy: 728, price_sell: 0, game_version: "4.8.3", date_modified: Math.floor(now / 1000) }
  ],
  item_prices: [
    { id: "ip-1", id_item: 9001, item_name: "Helix II Mining Head", terminal_name: "Platinum Bay", star_system_name: "Stanton", space_station_name: "HUR-L2", price_buy: 108250, price_sell: 0, game_version: "4.8.3", date_modified: Math.floor(now / 1000) },
    { id: "ip-2", id_item: 9001, item_name: "Helix II Mining Head", terminal_name: "Dumper's Depot", star_system_name: "Nyx", city_name: "Levski", price_buy: 109500, price_sell: 0, game_version: "4.8.3", date_modified: Math.floor(now / 1000) }
  ]
};

export const sampleData = {
  profiles: [
    sampleProfile,
    { id: "m-001", display_name: "Alex Mercer", rsi_handle: "MercerFN", discord_handle: "mercer", role: "officer", rank: "officer", roles: [], status: "active", points_balance: 1460, primary_division: "Operations" },
    { id: "m-002", display_name: "Sam Vale", rsi_handle: "ValeHauler", discord_handle: "vale", role: "quartermaster", rank: "officer", roles: ["quartermaster"], status: "active", points_balance: 2380, primary_division: "Logistics" },
    { id: "m-003", display_name: "Rin Torres", rsi_handle: "RinScout", discord_handle: "rinscout", role: "member", rank: "enlisted", roles: [], status: "active", points_balance: 780, primary_division: "Recon" },
    { id: "m-004", display_name: "Jamie Stone", rsi_handle: "StoneMedic", discord_handle: "stone", role: "member", rank: "enlisted", roles: [], status: "inactive", points_balance: 210, primary_division: "Medical" }
  ],
  live_patch_records: [
    { id: "patch-live", environment: "LIVE", version: "4.8.3", released_at: "2026-07-01T00:00:00Z", source_name: "Official RSI patch notes", source_url: "https://robertsspaceindustries.com/en/comm-link/Patch-Notes/21168-Star-Citizen-Alpha-48", status: "active", checked_at: hours(-1) }
  ],
  announcements: [
    { id: "an-1", title: "LIVE information only", body: "All operational records must match Alpha 4.8.3 LIVE. PTU, EPTU and Evocati data is rejected.", priority: "critical", created_at: hours(-4) },
    { id: "an-2", title: "Warehouse reconciliation", body: "Quartermasters are checking physical stock against the portal before the weekend operation.", priority: "normal", created_at: days(-1) }
  ],
  notifications: [
    { id: "nt-1", member_id: "demo-admin", title: "Two discoveries await approval", message: "A mining coordinate and salvage location need officer review.", category: "verification", read_at: null, created_at: hours(-2) },
    { id: "nt-2", member_id: "demo-admin", title: "Refinery job due soon", message: "Stileron batch at ARC-L1 is due for collection.", category: "refinery", read_at: null, created_at: hours(-5) }
  ],
  warehouse_items: [
    { id: "wh-1", name: "Stileron", category: "Raw material", quantity: 172, reserved_quantity: 80, unit: "SCU", storage_location: "ARC-L1 / Bay A", condition: "raw", status: "available", minimum_stock: 250, image_url: "", updated_at: hours(-3) },
    { id: "wh-2", name: "RMC", category: "Salvage material", quantity: 86, reserved_quantity: 0, unit: "SCU", storage_location: "Baijini Point / Bay C", condition: "sale-ready", status: "available", minimum_stock: 50, image_url: "", updated_at: hours(-8) },
    { id: "wh-3", name: "Medical Supplies", category: "Commodity", quantity: 24, reserved_quantity: 12, unit: "SCU", storage_location: "Pyro Gateway / Locker 2", condition: "sealed", status: "available", minimum_stock: 32, image_url: "", updated_at: hours(-1) },
    { id: "wh-4", name: "Helix II Mining Head", category: "Mining component", quantity: 2, reserved_quantity: 1, unit: "units", storage_location: "Levski / Equipment cage", condition: "serviceable", status: "available", minimum_stock: 2, image_url: "", updated_at: days(-1) }
  ],
  inventory_movements: [
    { id: "mv-1", item_name: "Stileron", quantity: 80, unit: "SCU", movement_type: "reserved", from_location: "ARC-L1 / Bay A", to_location: "Craft Job CJ-04", member_id: "m-002", linked_record: "wo-1", status: "active", created_at: hours(-5) },
    { id: "mv-2", item_name: "RMC", quantity: 48, unit: "SCU", movement_type: "deposit", from_location: "Reclaimer", to_location: "Baijini Point / Bay C", member_id: "m-001", linked_record: "op-2", status: "complete", created_at: days(-1) }
  ],
  blueprints: [
    { id: "bp-1", name: "FS-9 LMG Improved", category: "Weapon", status: "owned", quality_target: 650, active: true, source: "Earned blueprint", game_version: "4.8.3", notes: "Organisation production candidate.", materials: [
      { material_name: "Stileron", quantity: 240, unit: "units", quality_min: 550 },
      { material_name: "Iron", quantity: 120, unit: "units", quality_min: 400 }
    ]},
    { id: "bp-2", name: "Industrial Component Test Build", category: "Component", status: "research", quality_target: 500, active: false, source: "Member discovery", game_version: "4.8.3", notes: "Recipe awaiting a second LIVE confirmation.", materials: [
      { material_name: "Stileron", quantity: 80, unit: "units", quality_min: 400 }
    ]}
  ],
  production_jobs: [
    { id: "pj-1", blueprint_name: "FS-9 LMG Improved", quantity: 2, quality_target: 650, status: "materials gathering", assigned_to: "m-002", output_location: "ARC-L1 / Bay A", due_at: days(4), game_version: "4.8.3", notes: "Do not consume reserve stock without quartermaster approval." }
  ],
  work_orders: [
    { id: "wo-1", title: "Acquire 400 SCU Stileron", category: "Mining", item_name: "Stileron", target_quantity: 400, current_quantity: 172, unit: "SCU", reward_points: 300, reward_auec: 0, priority: "high", status: "open", claimed_by: "", linked_module: "crafting", deadline: days(5), game_version: "4.8.3", description: "Supply the active organisation blueprint project." },
    { id: "wo-2", title: "Recover size 2 mining modules", category: "Salvage", item_name: "Mining modules", target_quantity: 4, current_quantity: 1, unit: "units", reward_points: 120, reward_auec: 100000, priority: "medium", status: "claimed", claimed_by: "m-001", linked_module: "fleet", deadline: days(3), game_version: "4.8.3", description: "Recover serviceable components or source verified replacements." }
  ],
  refinery_jobs: [
    { id: "rf-1", material_name: "Stileron", raw_quantity: 96, expected_yield: 82, unit: "SCU", refinery_location: "ARC-L1", refining_method: "Dinyx Solventation", cost_auec: 11800, status: "processing", owner_id: "m-002", hauler_id: "m-003", completes_at: hours(11), collection_deadline: days(2), destination: "ARC-L1 / Bay A", game_version: "4.8.3", notes: "Reserved for blueprint job." }
  ],
  knowledge_locations: [
    { id: "kb-1", item_name: "Helix II Mining Head", category: "Mining component", location_name: "Platinum Bay", system_name: "Stanton", body_name: "ARC-L1", terminal_name: "Refinery deck shop", source_type: "UEX + member confirmation", game_version: "4.8.3", confidence: "high", confirmations: 4, status: "approved", price_auec: 108000, last_confirmed_at: hours(-6), submitted_by: "m-002", coordinates: "Station interior", notes: "Current LIVE record; stock may fluctuate." },
    { id: "kb-2", item_name: "Rieger-C3 Module", category: "Mining module", location_name: "Levski", system_name: "Nyx", body_name: "Delamar", terminal_name: "Mining support shop", source_type: "Free Navy", game_version: "4.8.3", confidence: "medium", confirmations: 2, status: "approved", price_auec: 0, last_confirmed_at: days(-1), submitted_by: "m-001", coordinates: "Shop interior", notes: "Price requires reconfirmation." },
    { id: "kb-3", item_name: "Medical Supplies", category: "Commodity", location_name: "Rayari Kaltag Research Outpost", system_name: "Stanton", body_name: "Calliope", terminal_name: "Commodity kiosk", source_type: "Member report", game_version: "4.8.3", confidence: "pending", confirmations: 1, status: "pending", price_auec: 0, last_confirmed_at: hours(-12), submitted_by: "m-003", coordinates: "Quantum marker", notes: "Awaiting officer approval." }
  ],
  mining_locations: [
    { id: "mn-1", material_name: "Stileron", system_name: "Pyro", body_name: "Asteroid field", location_name: "Member-reported field", mining_method: "Ship mining", coordinates: "Awaiting scout triangulation", nearby_marker: "Not published until verified", concentration: "unknown", risk_level: "high", ship_recommendation: "MOLE / Prospector", refinery_route: "Nearest suitable refinery to be confirmed", source_type: "Member report", game_version: "4.8.3", confidence: "pending", confirmations: 1, status: "pending", last_confirmed_at: hours(-9), notes: "User-submitted lead. Not treated as trusted until confirmed on LIVE." },
    { id: "mn-2", material_name: "Mixed industrial ore", system_name: "Stanton", body_name: "Aaron Halo", location_name: "Halo band survey sector", mining_method: "Ship mining", coordinates: "Use current Free Navy route card", nearby_marker: "Stanton navigation", concentration: "variable", risk_level: "medium", ship_recommendation: "Prospector / MOLE", refinery_route: "Select by current yield and travel time", source_type: "Free Navy scouting", game_version: "4.8.3", confidence: "medium", confirmations: 3, status: "approved", last_confirmed_at: hours(-15), notes: "Material composition varies. Confirm scanner results before committing the fleet." }
  ],
  salvage_locations: [
    { id: "sv-1", material_name: "RMC / CMAT", system_name: "Pyro", body_name: "Settlement approaches", location_name: "High-traffic wreck search", salvage_method: "Opportunistic wreck recovery", coordinates: "Dynamic; use member wreck reports", nearby_marker: "Settlement quantum marker", expected_yield: "variable", risk_level: "high", ship_recommendation: "Vulture with escort", sale_route: "Nearest verified demand terminal", source_type: "Free Navy operations", game_version: "4.8.3", confidence: "medium", confirmations: 3, status: "approved", expires_at: days(7), last_confirmed_at: hours(-10), notes: "Search pattern, not a guaranteed persistent wreck spawn." },
    { id: "sv-2", material_name: "Components and cargo", system_name: "Nyx", body_name: "Delamar region", location_name: "Unverified wreck cluster", salvage_method: "Component recovery", coordinates: "Officer restricted", nearby_marker: "Levski", expected_yield: "unknown", risk_level: "medium", ship_recommendation: "Vulture + cargo support", sale_route: "Levski / org warehouse", source_type: "Member report", game_version: "4.8.3", confidence: "pending", confirmations: 1, status: "pending", expires_at: days(2), last_confirmed_at: hours(-5), notes: "Temporary wreck report; expires automatically." }
  ],
  wreck_reports: [
    { id: "wr-1", title: "Hammerhead wreck", system_name: "Pyro", location_name: "Near settlement approach", coordinates: "Shared with claimed crew", ship_type: "Hammerhead", salvage_remaining: "high", cargo_found: "unknown", reported_by: "m-003", claimed_by: "m-001", status: "claimed", expires_at: hours(5), game_version: "4.8.3", notes: "Escort requested." }
  ],
  auctions: [
    { id: "auc-1", title: "Helix II Mining Head", description: "Warehouse surplus unit, serviceable condition.", starting_bid: 300, current_bid: 460, current_winner_id: "m-003", status: "open", ends_at: hours(18), image_url: "", created_by: "m-002" },
    { id: "auc-2", title: "Salvage component bundle", description: "Mixed recovered components; itemised on collection.", starting_bid: 120, current_bid: 120, current_winner_id: "", status: "open", ends_at: days(2), image_url: "", created_by: "m-001" }
  ],
  auction_bids: [],
  market_listings: [
    { id: "mk-1", title: "32 SCU cargo transport", listing_type: "service", price_auec: 85000, price_points: 0, quantity: 1, seller_id: "m-003", location: "Stanton", status: "active", game_version: "4.8.3", description: "Pickup and delivery within Stanton; risk surcharge by agreement." },
    { id: "mk-2", title: "Rieger-C3 Module", listing_type: "item", price_auec: 0, price_points: 180, quantity: 1, seller_id: "m-002", location: "Levski", status: "active", game_version: "4.8.3", description: "Serviceable spare." }
  ],
  contracts: [
    { id: "ct-1", title: "Collect refinery output", category: "Haulage", reward_auec: 140000, reward_points: 40, location: "ARC-L1", status: "open", claimed_by: "", deadline: days(2), game_version: "4.8.3", description: "Transport reserved Stileron to the organisation warehouse." },
    { id: "ct-2", title: "Scout Pyro salvage sites", category: "Recon", reward_auec: 200000, reward_points: 80, location: "Pyro", status: "claimed", claimed_by: "m-001", deadline: days(1), game_version: "4.8.3", description: "Return three viable coordinates and threat notes." }
  ],
  operations: [
    { id: "op-1", title: "Stileron acquisition operation", operation_type: "Mining", start_at: hours(28), end_at: hours(33), location: "Pyro staging point", status: "scheduled", commander_id: "m-001", required_roles: "MOLE crew, escort, hauler", reward_points: 120, game_version: "4.8.3", briefing: "Gather verified Stileron for the active work order. Location disclosed at briefing." },
    { id: "op-2", title: "Reclaimer salvage sweep", operation_type: "Salvage", start_at: days(-1), end_at: hours(-16), location: "Stanton", status: "completed", commander_id: "demo-admin", required_roles: "Reclaimer crew, cargo support", reward_points: 90, game_version: "4.8.3", briefing: "Completed; after-action report filed." }
  ],
  operation_attendance: [
    { id: "oa-1", operation_id: "op-1", member_id: "m-003", status: "accepted", crew_role: "Scout" },
    { id: "oa-2", operation_id: "op-1", member_id: "m-002", status: "accepted", crew_role: "MOLE operator" }
  ],
  crew_availability: [
    { id: "ca-1", member_id: "m-003", availability: "Tonight", available_from: hours(2), available_until: hours(7), preferred_activities: "Scouting, cargo", qualified_roles: "Scout, cargo operator", current_location: "Pyro Gateway", voice_available: true, status: "available" },
    { id: "ca-2", member_id: "m-002", availability: "Weekend", available_from: days(1), available_until: days(2), preferred_activities: "Mining, logistics", qualified_roles: "MOLE operator, quartermaster", current_location: "Levski", voice_available: true, status: "available" }
  ],
  fleet_ships: [
    { id: "f-1", ship_name: "Reclaimer", variant: "Reclaimer", owner_id: "demo-admin", org_owned: true, role: "Salvage", status: "available", home_location: "ARC-L1", fuel_percent: 82, hull_percent: 96, crew_required: 5, loadout_imprinted: true, reserved_by: "", notes: "Full salvage crew preferred." },
    { id: "f-2", ship_name: "MOLE", variant: "Argo MOLE", owner_id: "m-002", org_owned: false, role: "Mining", status: "available", home_location: "Levski", fuel_percent: 65, hull_percent: 100, crew_required: 4, loadout_imprinted: true, reserved_by: "op-1", notes: "Helix loadout." },
    { id: "f-3", ship_name: "Ironclad", variant: "Drake Ironclad", owner_id: "m-001", org_owned: false, role: "Heavy logistics", status: "maintenance", home_location: "Lorville", fuel_percent: 40, hull_percent: 72, crew_required: 4, loadout_imprinted: false, reserved_by: "", notes: "Cargo grid inspection." },
    { id: "f-4", ship_name: "Starfarer", variant: "Starfarer", owner_id: "demo-admin", org_owned: true, role: "Refuelling", status: "available", home_location: "Pyro Gateway", fuel_percent: 100, hull_percent: 91, crew_required: 5, loadout_imprinted: true, reserved_by: "", notes: "Fuel pods full." }
  ],
  rescue_requests: [
    { id: "rr-1", title: "Medical pickup required", request_type: "Medical", requester_id: "m-003", system_name: "Pyro", location_name: "Settlement outskirts", coordinates: "Shared with responder", threat_level: "high", status: "open", responder_id: "", ship_required: "Medical ship + escort", created_at: hours(-1), game_version: "4.8.3", notes: "Example emergency card for demo mode." }
  ],
  exploration_routes: [
    { id: "ex-1", name: "Pyro industrial survey route", system_name: "Pyro", route_type: "Mining reconnaissance", waypoint_count: 5, start_marker: "Pyro Gateway", end_marker: "Ruin Station", visibility: "members", status: "active", game_version: "4.8.3", coordinates: "Waypoint cards stored in the operation briefing", notes: "Reconfirm after navigation or POI changes." }
  ],
  intel_reports: [
    { id: "ir-1", title: "Pirate activity near Pyro Gateway", category: "Threat", system_name: "Pyro", location_name: "Gateway approach", threat_level: "high", classification: "members", status: "active", details: "Two interdictions reported during cargo movement. Escorts recommended.", reported_by: "m-001", expires_at: days(3), game_version: "4.8.3", created_at: hours(-7) },
    { id: "ir-2", title: "Possible mineral field", category: "Resource", system_name: "Nyx", location_name: "Restricted coordinates", threat_level: "medium", classification: "officers", status: "unverified", details: "Scout report awaiting second scan.", reported_by: "m-003", expires_at: days(2), game_version: "4.8.3", created_at: days(-1) }
  ],
  incident_reports: [
    { id: "inc-1", title: "Cargo loss during shard recovery", category: "Logistics", severity: "medium", location: "CRU-L4", status: "review", reported_by: "m-003", occurred_at: days(-2), game_version: "4.8.3", details: "Medical supplies became inaccessible after server recovery. Capture replication steps." }
  ],
  training_courses: [
    { id: "tr-1", title: "Reclaimer crew drill", category: "Salvage", instructor_id: "m-001", start_at: days(3), seats: 10, points_reward: 40, status: "open", game_version: "4.8.3", description: "Salvage stations, cargo flow, safety and communication." },
    { id: "tr-2", title: "Cargo and freight elevator SOP", category: "Logistics", instructor_id: "m-002", start_at: days(5), seats: 12, points_reward: 30, status: "open", game_version: "4.8.3", description: "Loading plans, box sizes, manifests and loss prevention." }
  ],
  member_qualifications: [
    { id: "mq-1", member_id: "m-002", qualification: "MOLE operator", level: "qualified", mentor_id: "demo-admin", awarded_at: days(-20), expires_at: null, game_version: "4.8.3", notes: "Recheck after major mining changes." },
    { id: "mq-2", member_id: "m-003", qualification: "Cargo operator", level: "qualified", mentor_id: "m-002", awarded_at: days(-8), expires_at: null, game_version: "4.8.3", notes: "Completed practical loading drill." }
  ],
  equipment_kits: [
    { id: "kit-1", name: "Mining EVA kit", category: "Mining", required_items: "EVA armour; multitool; tractor attachment; medpens; food and drink", warehouse_status: "partial", reserve_status: "available", estimated_cost_auec: 34000, game_version: "4.8.3", notes: "Where-to-buy links resolve through the knowledge base." },
    { id: "kit-2", name: "Medical response kit", category: "Medical", required_items: "Medical gun; refills; medpens; tractor; armour", warehouse_status: "ready", reserve_status: "reserved", estimated_cost_auec: 28000, game_version: "4.8.3", notes: "Reserved for emergency response ship." }
  ],
  wikelo_projects: [
    { id: "wk-1", name: "Wikelo ship reward", category: "Vehicle", target_quantity: 1, current_quantity: 0, unit: "reward", status: "active", game_version: "4.8.3", notes: "Track prerequisite mission chain." },
    { id: "wk-2", name: "Executive Hangar tokens", category: "Token", target_quantity: 24, current_quantity: 17, unit: "tokens", status: "active", game_version: "4.8.3", notes: "Seven remaining." }
  ],
  donations: [
    { id: "d-1", member_id: "m-003", amount: 500000, donation_type: "aUEC", purpose: "Fuel fund", created_at: days(-1) },
    { id: "d-2", member_id: "m-002", amount: 1200000, donation_type: "aUEC", purpose: "Org ship purchase", created_at: days(-3) }
  ],
  points_ledger: [
    { id: "pl-1", member_id: "m-003", amount: 120, reason: "Nyx logistics operation", linked_record: "op-2", created_by: "m-001", created_at: days(-2) },
    { id: "pl-2", member_id: "m-002", amount: 80, reason: "Warehouse reconciliation", linked_record: "wh-audit", created_by: "demo-admin", created_at: days(-1) }
  ],
  sync_sources: [
    { id: "sync-1", source_name: "Official RSI LIVE version", source_type: "Official RSI", cadence: "3 hours", status: "configured", required_patch: "4.8.3", last_success_at: hours(-1), records_changed: 1, notes: "Gatekeeper source. Test environments are ignored." },
    { id: "sync-2", source_name: "UEX commodities and routes", source_type: "UEX API", cadence: "30 minutes", status: "configured", required_patch: "4.8.3", last_success_at: hours(-1), records_changed: 46, notes: "Only rows matching the configured LIVE version are exposed." },
    { id: "sync-3", source_name: "Free Navy member verification", source_type: "Internal", cadence: "Immediate", status: "configured", required_patch: "4.8.3", last_success_at: hours(-2), records_changed: 2, notes: "Member reports remain pending until officer approval." }
  ],
  live_confirmations: [],
  member_roles: [
    { id: "mr-1", profile_id: "demo-admin", role: "admin" },
    { id: "mr-2", profile_id: "demo-admin", role: "quartermaster" },
    { id: "mr-3", profile_id: "demo-admin", role: "treasurer" },
    { id: "mr-4", profile_id: "m-002", role: "quartermaster" }
  ],
  membership_applications: [
    { id: "app-1", email: "recruit@example.com", display_name: "Prospective Member", rsi_handle: "RecruitOne", discord_handle: "recruitone", message: "Interested in mining and logistics.", token_date: new Date().toISOString().slice(0,10), status: "pending", created_at: hours(-3) }
  ],
  data_flags: [
    { id: "flag-1", target_table: "knowledge_locations", target_id: "kb-2", target_name: "Rieger-C3 Module", reason: "Location may be outdated", explanation: "Could not find this item at the listed terminal on LIVE.", suggested_correction: "Recheck Levski shop stock.", evidence_url: "", status: "open", reported_by: "m-003", created_at: hours(-6) }
  ],
  game_catalog: [
    { id: "gc-1", entity_type: "ship_vehicle", source_name: "Star Citizen Wiki game data", source_id: "reclaimer", game_uuid: "", name: "Reclaimer", category: "Heavy Salvage", manufacturer: "Aegis Dynamics", description: "Multi-crew salvage vessel.", game_version: "4.8.3", environment: "LIVE", status: "active", confidence: "source", imported_at: hours(-2) },
    { id: "gc-2", entity_type: "item", source_name: "UEX item and location data", source_id: "helix-ii", game_uuid: "", name: "Helix II Mining Head", category: "Mining", manufacturer: "Shubin Interstellar", description: "Size 2 mining head.", game_version: "4.8.3", environment: "LIVE", status: "active", confidence: "source", imported_at: hours(-2) }
  ],
  catalog_locations: [],
  data_source_records: [],
  data_import_runs: [],
  page_content: [],
  page_backgrounds: [],
  audit_log: [
    { id: "log-1", actor_id: "demo-admin", action: "warehouse.update", entity_type: "warehouse_item", entity_name: "Medical Supplies", created_at: hours(-2) },
    { id: "log-2", actor_id: "m-002", action: "location.submit", entity_type: "mining_location", entity_name: "Stileron field report", created_at: days(-1) }
  ]
};
