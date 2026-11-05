/**
 * Sovereign-country profiles (approx. lon/lat boxes on equirectangular map).
 * First matching box wins — list smaller / more specific countries before large ones.
 *
 * Scores 0–100:
 *  tech, industry, naval, airforce, nuclear,
 *  weaponized  = already fielded weapons systems
 *  weaponizable = dual-use tech that can be turned into arms under wartime pressure
 */

const GEO_PROFILES = [
  // —— Small / specific first ——
  { name: "Singapore", iso: "SG", lon: [103.6, 104.1], lat: [1.2, 1.5], tech: 92, industry: 85, naval: 70, airforce: 65, nuclear: 0, weaponized: 55, weaponizable: 80, weapons: ["air-defense", "frigates", "missiles"], dualUse: ["semiconductors", "ports", "finance"], militarism: 40, island: true, pacifism: 50 },
  { name: "Taiwan", iso: "TW", lon: [119.3, 122.1], lat: [21.8, 25.4], tech: 94, industry: 90, naval: 58, airforce: 72, nuclear: 8, weaponized: 62, weaponizable: 95, weapons: ["fighters", "anti-ship-missiles", "air-defense"], dualUse: ["semiconductors", "drones", "shipyards"], militarism: 55, island: true, pacifism: 40 },
  { name: "Hong Kong", iso: "HK", lon: [113.8, 114.5], lat: [22.1, 22.6], tech: 85, industry: 75, naval: 35, airforce: 20, nuclear: 0, weaponized: 15, weaponizable: 70, weapons: ["coast-guard"], dualUse: ["finance", "ports", "electronics"], militarism: 25, island: true, pacifism: 55 },
  { name: "Israel", iso: "IL", lon: [34.2, 35.9], lat: [29.4, 33.4], tech: 92, industry: 78, naval: 55, airforce: 95, nuclear: 88, weaponized: 92, weaponizable: 90, weapons: ["fighters", "missile-defense", "drones", "nukes-undeclared", "cyber"], dualUse: ["avionics", "AI", "cyber"], militarism: 85, island: false, pacifism: 15 },
  { name: "Palestine / Gaza-West Bank", iso: "PS", lon: [34.2, 35.6], lat: [31.2, 32.6], tech: 35, industry: 25, naval: 5, airforce: 5, nuclear: 0, weaponized: 25, weaponizable: 20, weapons: ["rockets", "irregular"], dualUse: [], militarism: 70, island: false, pacifism: 20 },
  { name: "Lebanon", iso: "LB", lon: [35.1, 36.7], lat: [33.0, 34.7], tech: 48, industry: 40, naval: 20, airforce: 25, nuclear: 0, weaponized: 40, weaponizable: 30, weapons: ["rockets", "militia"], dualUse: [], militarism: 60, island: false, pacifism: 25 },
  { name: "Jordan", iso: "JO", lon: [34.9, 39.3], lat: [29.2, 33.4], tech: 50, industry: 42, naval: 15, airforce: 45, nuclear: 0, weaponized: 45, weaponizable: 40, weapons: ["fighters", "armor"], dualUse: ["aviation"], militarism: 55, island: false, pacifism: 35 },
  { name: "Kuwait", iso: "KW", lon: [46.5, 48.5], lat: [28.5, 30.1], tech: 62, industry: 50, naval: 35, airforce: 50, nuclear: 0, weaponized: 48, weaponizable: 55, weapons: ["fighters", "air-defense"], dualUse: ["energy"], militarism: 45, island: false, pacifism: 40 },
  { name: "Qatar", iso: "QA", lon: [50.7, 51.7], lat: [24.4, 26.2], tech: 70, industry: 55, naval: 40, airforce: 60, nuclear: 0, weaponized: 55, weaponizable: 60, weapons: ["fighters", "air-defense"], dualUse: ["energy", "ports"], militarism: 45, island: false, pacifism: 40 },
  { name: "Bahrain", iso: "BH", lon: [50.3, 50.8], lat: [25.7, 26.4], tech: 60, industry: 48, naval: 45, airforce: 45, nuclear: 0, weaponized: 42, weaponizable: 50, weapons: ["patrol-craft", "air-defense"], dualUse: ["ports"], militarism: 45, island: true, pacifism: 40 },
  { name: "UAE", iso: "AE", lon: [51.5, 56.5], lat: [22.6, 26.1], tech: 75, industry: 65, naval: 50, airforce: 72, nuclear: 5, weaponized: 68, weaponizable: 70, weapons: ["fighters", "drones", "missiles"], dualUse: ["space-launch", "AI", "energy"], militarism: 60, island: false, pacifism: 30 },
  { name: "Oman", iso: "OM", lon: [52.0, 59.9], lat: [16.6, 26.4], tech: 52, industry: 45, naval: 45, airforce: 40, nuclear: 0, weaponized: 40, weaponizable: 45, weapons: ["patrol-craft", "fighters"], dualUse: ["ports"], militarism: 45, island: false, pacifism: 45 },
  { name: "Cyprus", iso: "CY", lon: [32.2, 34.7], lat: [34.5, 35.8], tech: 65, industry: 55, naval: 30, airforce: 25, nuclear: 0, weaponized: 30, weaponizable: 50, weapons: ["coast-defense"], dualUse: ["ports"], militarism: 40, island: true, pacifism: 50 },
  { name: "Malta", iso: "MT", lon: [14.1, 14.6], lat: [35.7, 36.1], tech: 68, industry: 55, naval: 35, airforce: 15, nuclear: 0, weaponized: 20, weaponizable: 45, weapons: ["patrol-craft"], dualUse: ["ports"], militarism: 25, island: true, pacifism: 65 },
  { name: "Iceland", iso: "IS", lon: [-24.6, -13.4], lat: [63.3, 66.6], tech: 80, industry: 55, naval: 40, airforce: 15, nuclear: 0, weaponized: 15, weaponizable: 55, weapons: ["coast-guard"], dualUse: ["geothermal", "fisheries"], militarism: 15, island: true, pacifism: 80 },
  { name: "Ireland", iso: "IE", lon: [-10.5, -5.9], lat: [51.4, 55.4], tech: 84, industry: 72, naval: 35, airforce: 25, nuclear: 0, weaponized: 20, weaponizable: 75, weapons: ["patrol-craft"], dualUse: ["pharma", "software", "semicon-fab"], militarism: 18, island: true, pacifism: 75 },
  { name: "Denmark", iso: "DK", lon: [8.0, 15.2], lat: [54.5, 57.8], tech: 88, industry: 75, naval: 60, airforce: 55, nuclear: 0, weaponized: 50, weaponizable: 78, weapons: ["frigates", "fighters", "arctic-patrol"], dualUse: ["pharma", "green-tech", "shipyards"], militarism: 35, island: false, pacifism: 65 },
  { name: "Netherlands", iso: "NL", lon: [3.3, 7.3], lat: [50.7, 53.6], tech: 90, industry: 85, naval: 65, airforce: 60, nuclear: 15, weaponized: 55, weaponizable: 88, weapons: ["frigates", "fighters", "submarines"], dualUse: ["semiconductors", "ports", "chem"], militarism: 35, island: false, pacifism: 60 },
  { name: "Belgium", iso: "BE", lon: [2.5, 6.4], lat: [49.5, 51.5], tech: 85, industry: 80, naval: 40, airforce: 55, nuclear: 10, weaponized: 50, weaponizable: 80, weapons: ["fighters", "armor"], dualUse: ["chem", "ports", "nuclear-power"], militarism: 35, island: false, pacifism: 60 },
  { name: "Luxembourg", iso: "LU", lon: [5.7, 6.5], lat: [49.4, 50.2], tech: 88, industry: 70, naval: 5, airforce: 15, nuclear: 0, weaponized: 15, weaponizable: 70, weapons: [], dualUse: ["finance", "satellites"], militarism: 20, island: false, pacifism: 70 },
  { name: "Switzerland", iso: "CH", lon: [5.9, 10.5], lat: [45.8, 47.9], tech: 93, industry: 85, naval: 5, airforce: 55, nuclear: 0, weaponized: 45, weaponizable: 90, weapons: ["fighters", "air-defense", "armor"], dualUse: ["precision-machining", "pharma", "finance"], militarism: 30, island: false, pacifism: 75 },
  { name: "Austria", iso: "AT", lon: [9.5, 17.2], lat: [46.3, 49.1], tech: 85, industry: 78, naval: 5, airforce: 40, nuclear: 0, weaponized: 35, weaponizable: 75, weapons: ["armor", "air-defense"], dualUse: ["machinery", "electronics"], militarism: 25, island: false, pacifism: 70 },
  { name: "Portugal", iso: "PT", lon: [-9.6, -6.1], lat: [36.9, 42.2], tech: 72, industry: 65, naval: 55, airforce: 45, nuclear: 0, weaponized: 42, weaponizable: 60, weapons: ["frigates", "fighters"], dualUse: ["shipyards", "ports"], militarism: 35, island: false, pacifism: 55 },
  { name: "Czechia", iso: "CZ", lon: [12.1, 18.9], lat: [48.5, 51.1], tech: 80, industry: 78, naval: 5, airforce: 45, nuclear: 0, weaponized: 48, weaponizable: 75, weapons: ["armor", "small-arms", "fighters"], dualUse: ["machinery", "autos"], militarism: 40, island: false, pacifism: 50 },
  { name: "Slovakia", iso: "SK", lon: [16.8, 22.6], lat: [47.7, 49.7], tech: 72, industry: 70, naval: 5, airforce: 35, nuclear: 0, weaponized: 40, weaponizable: 65, weapons: ["armor", "artillery"], dualUse: ["autos", "machinery"], militarism: 40, island: false, pacifism: 50 },
  { name: "Hungary", iso: "HU", lon: [16.1, 22.9], lat: [45.7, 48.6], tech: 70, industry: 68, naval: 5, airforce: 40, nuclear: 0, weaponized: 42, weaponizable: 60, weapons: ["armor", "fighters"], dualUse: ["autos", "electronics"], militarism: 45, island: false, pacifism: 45 },
  { name: "Croatia", iso: "HR", lon: [13.4, 19.5], lat: [42.3, 46.6], tech: 65, industry: 55, naval: 40, airforce: 30, nuclear: 0, weaponized: 38, weaponizable: 50, weapons: ["patrol-craft", "armor"], dualUse: ["shipyards", "tourism"], militarism: 45, island: false, pacifism: 45 },
  { name: "Serbia", iso: "RS", lon: [18.8, 23.1], lat: [42.2, 46.2], tech: 55, industry: 50, naval: 10, airforce: 40, nuclear: 0, weaponized: 50, weaponizable: 55, weapons: ["armor", "artillery", "drones"], dualUse: ["munitions", "aviation"], militarism: 60, island: false, pacifism: 30 },
  { name: "Bosnia", iso: "BA", lon: [15.7, 19.7], lat: [42.5, 45.3], tech: 45, industry: 40, naval: 10, airforce: 20, nuclear: 0, weaponized: 30, weaponizable: 35, weapons: ["small-arms"], dualUse: [], militarism: 50, island: false, pacifism: 40 },
  { name: "Albania", iso: "AL", lon: [19.2, 21.1], lat: [39.6, 42.7], tech: 45, industry: 38, naval: 25, airforce: 20, nuclear: 0, weaponized: 28, weaponizable: 35, weapons: ["patrol-craft"], dualUse: [], militarism: 45, island: false, pacifism: 40 },
  { name: "North Macedonia", iso: "MK", lon: [20.4, 23.1], lat: [40.8, 42.4], tech: 45, industry: 40, naval: 5, airforce: 20, nuclear: 0, weaponized: 25, weaponizable: 35, weapons: ["small-arms"], dualUse: [], militarism: 45, island: false, pacifism: 40 },
  { name: "Bulgaria", iso: "BG", lon: [22.3, 28.7], lat: [41.2, 44.3], tech: 58, industry: 55, naval: 30, airforce: 40, nuclear: 0, weaponized: 42, weaponizable: 50, weapons: ["fighters", "armor"], dualUse: ["munitions"], militarism: 45, island: false, pacifism: 45 },
  { name: "Romania", iso: "RO", lon: [20.2, 29.8], lat: [43.6, 48.3], tech: 60, industry: 58, naval: 35, airforce: 45, nuclear: 0, weaponized: 48, weaponizable: 55, weapons: ["fighters", "armor", "frigates"], dualUse: ["aviation", "autos"], militarism: 50, island: false, pacifism: 40 },
  { name: "Moldova", iso: "MD", lon: [26.6, 30.2], lat: [45.4, 48.5], tech: 42, industry: 35, naval: 5, airforce: 15, nuclear: 0, weaponized: 20, weaponizable: 30, weapons: ["small-arms"], dualUse: [], militarism: 40, island: false, pacifism: 45 },
  { name: "Belarus", iso: "BY", lon: [23.1, 32.8], lat: [51.2, 56.2], tech: 55, industry: 55, naval: 5, airforce: 50, nuclear: 20, weaponized: 55, weaponizable: 50, weapons: ["air-defense", "armor", "missiles"], dualUse: ["trucks", "electronics"], militarism: 65, island: false, pacifism: 25 },
  { name: "Lithuania", iso: "LT", lon: [20.9, 26.9], lat: [53.8, 56.5], tech: 72, industry: 60, naval: 25, airforce: 35, nuclear: 0, weaponized: 40, weaponizable: 55, weapons: ["air-defense", "armor"], dualUse: ["electronics"], militarism: 50, island: false, pacifism: 40 },
  { name: "Latvia", iso: "LV", lon: [20.9, 28.3], lat: [55.6, 58.1], tech: 70, industry: 55, naval: 30, airforce: 30, nuclear: 0, weaponized: 35, weaponizable: 50, weapons: ["air-defense"], dualUse: ["electronics"], militarism: 48, island: false, pacifism: 42 },
  { name: "Estonia", iso: "EE", lon: [21.7, 28.3], lat: [57.5, 59.8], tech: 80, industry: 60, naval: 30, airforce: 30, nuclear: 0, weaponized: 40, weaponizable: 75, weapons: ["cyber", "air-defense"], dualUse: ["cyber", "software"], militarism: 50, island: false, pacifism: 40 },
  { name: "Finland", iso: "FI", lon: [20.5, 31.6], lat: [59.7, 70.1], tech: 90, industry: 75, naval: 45, airforce: 70, nuclear: 0, weaponized: 65, weaponizable: 85, weapons: ["fighters", "artillery", "icebreakers"], dualUse: ["comms", "shipyards", "nuclear-power"], militarism: 45, island: false, pacifism: 55 },
  { name: "Norway", iso: "NO", lon: [4.5, 31.2], lat: [57.9, 71.2], tech: 88, industry: 72, naval: 75, airforce: 65, nuclear: 0, weaponized: 60, weaponizable: 80, weapons: ["frigates", "submarines", "fighters", "missiles"], dualUse: ["energy", "shipyards", "space"], militarism: 40, island: false, pacifism: 60 },
  { name: "Sweden", iso: "SE", lon: [11.0, 24.2], lat: [55.3, 69.1], tech: 92, industry: 80, naval: 60, airforce: 75, nuclear: 5, weaponized: 70, weaponizable: 90, weapons: ["fighters", "submarines", "air-defense", "armor"], dualUse: ["aerospace", "iron", "nuclear-power"], militarism: 40, island: false, pacifism: 60 },
  { name: "Poland", iso: "PL", lon: [14.1, 24.2], lat: [49.0, 54.9], tech: 72, industry: 70, naval: 40, airforce: 60, nuclear: 0, weaponized: 65, weaponizable: 70, weapons: ["fighters", "armor", "artillery", "air-defense"], dualUse: ["autos", "machinery"], militarism: 60, island: false, pacifism: 30 },
  { name: "Ukraine", iso: "UA", lon: [22.1, 40.3], lat: [44.3, 52.4], tech: 58, industry: 55, naval: 25, airforce: 55, nuclear: 5, weaponized: 72, weaponizable: 70, weapons: ["drones", "artillery", "missiles", "armor"], dualUse: ["aerospace", "steel", "IT"], militarism: 80, island: false, pacifism: 15 },
  { name: "Georgia", iso: "GE", lon: [39.9, 46.8], lat: [41.0, 43.6], tech: 50, industry: 40, naval: 20, airforce: 30, nuclear: 0, weaponized: 35, weaponizable: 40, weapons: ["armor", "air-defense"], dualUse: [], militarism: 55, island: false, pacifism: 30 },
  { name: "Armenia", iso: "AM", lon: [43.4, 46.7], lat: [38.8, 41.3], tech: 48, industry: 40, naval: 5, airforce: 30, nuclear: 0, weaponized: 40, weaponizable: 40, weapons: ["missiles", "armor"], dualUse: [], militarism: 65, island: false, pacifism: 25 },
  { name: "Azerbaijan", iso: "AZ", lon: [44.7, 50.4], lat: [38.4, 41.9], tech: 52, industry: 50, naval: 25, airforce: 45, nuclear: 0, weaponized: 58, weaponizable: 50, weapons: ["drones", "missiles", "armor"], dualUse: ["energy"], militarism: 70, island: false, pacifism: 20 },
  { name: "New Zealand", iso: "NZ", lon: [166.0, 179.0], lat: [-47.5, -34.0], tech: 78, industry: 60, naval: 50, airforce: 35, nuclear: 0, weaponized: 30, weaponizable: 55, weapons: ["patrol-craft"], dualUse: ["agritech", "space-tracking"], militarism: 25, island: true, pacifism: 75 },
  { name: "Sri Lanka", iso: "LK", lon: [79.5, 82.0], lat: [5.8, 9.9], tech: 48, industry: 42, naval: 40, airforce: 30, nuclear: 0, weaponized: 35, weaponizable: 40, weapons: ["patrol-craft", "fighters"], dualUse: ["ports"], militarism: 45, island: true, pacifism: 40 },
  { name: "Bangladesh", iso: "BD", lon: [88.0, 92.7], lat: [20.7, 26.7], tech: 42, industry: 45, naval: 30, airforce: 30, nuclear: 0, weaponized: 32, weaponizable: 40, weapons: ["patrol-craft", "fighters"], dualUse: ["shipyards", "textiles"], militarism: 45, island: false, pacifism: 40 },
  { name: "Nepal", iso: "NP", lon: [80.0, 88.2], lat: [26.3, 30.5], tech: 35, industry: 28, naval: 0, airforce: 15, nuclear: 0, weaponized: 20, weaponizable: 25, weapons: ["small-arms"], dualUse: [], militarism: 40, island: false, pacifism: 50 },
  { name: "Bhutan", iso: "BT", lon: [88.7, 92.2], lat: [26.7, 28.4], tech: 40, industry: 30, naval: 0, airforce: 10, nuclear: 0, weaponized: 15, weaponizable: 25, weapons: [], dualUse: ["hydro"], militarism: 25, island: false, pacifism: 70 },
  { name: "Cambodia", iso: "KH", lon: [102.3, 107.7], lat: [10.3, 14.8], tech: 35, industry: 35, naval: 20, airforce: 20, nuclear: 0, weaponized: 25, weaponizable: 30, weapons: ["small-arms"], dualUse: [], militarism: 45, island: false, pacifism: 40 },
  { name: "Laos", iso: "LA", lon: [100.0, 107.7], lat: [13.9, 22.6], tech: 30, industry: 28, naval: 5, airforce: 15, nuclear: 0, weaponized: 20, weaponizable: 25, weapons: ["small-arms"], dualUse: ["hydro"], militarism: 40, island: false, pacifism: 45 },
  { name: "North Korea", iso: "KP", lon: [124.1, 130.7], lat: [37.6, 43.1], tech: 40, industry: 35, naval: 35, airforce: 40, nuclear: 85, weaponized: 80, weaponizable: 55, weapons: ["nukes", "ballistic-missiles", "artillery", "cyber"], dualUse: ["rocketry", "enrichment"], militarism: 95, island: false, pacifism: 5 },
  { name: "South Korea", iso: "KR", lon: [125.0, 129.7], lat: [33.9, 38.7], tech: 92, industry: 90, naval: 70, airforce: 85, nuclear: 15, weaponized: 78, weaponizable: 92, weapons: ["fighters", "missiles", "submarines", "artillery", "air-defense"], dualUse: ["shipyards", "semiconductors", "autos", "rocketry"], militarism: 60, island: false, pacifism: 35 },
  { name: "Dominican Republic", iso: "DO", lon: [-72.1, -68.2], lat: [17.4, 20.0], tech: 45, industry: 40, naval: 30, airforce: 25, nuclear: 0, weaponized: 25, weaponizable: 35, weapons: ["patrol-craft"], dualUse: ["ports"], militarism: 40, island: true, pacifism: 45 },
  { name: "Cuba", iso: "CU", lon: [-85.0, -74.0], lat: [19.8, 23.3], tech: 45, industry: 35, naval: 30, airforce: 35, nuclear: 5, weaponized: 40, weaponizable: 40, weapons: ["air-defense", "patrol-craft"], dualUse: ["biotech"], militarism: 55, island: true, pacifism: 30 },
  { name: "Haiti", iso: "HT", lon: [-74.5, -71.6], lat: [18.0, 20.1], tech: 25, industry: 20, naval: 10, airforce: 5, nuclear: 0, weaponized: 15, weaponizable: 15, weapons: ["small-arms"], dualUse: [], militarism: 45, island: true, pacifism: 35 },
  { name: "Jamaica", iso: "JM", lon: [-78.4, -76.1], lat: [17.7, 18.6], tech: 45, industry: 35, naval: 25, airforce: 15, nuclear: 0, weaponized: 20, weaponizable: 30, weapons: ["patrol-craft"], dualUse: ["ports"], militarism: 35, island: true, pacifism: 50 },
  { name: "Panama", iso: "PA", lon: [-83.1, -77.1], lat: [7.1, 9.7], tech: 50, industry: 42, naval: 30, airforce: 20, nuclear: 0, weaponized: 22, weaponizable: 45, weapons: ["patrol-craft"], dualUse: ["canal", "ports", "logistics"], militarism: 30, island: false, pacifism: 55 },
  { name: "Costa Rica", iso: "CR", lon: [-85.95, -82.5], lat: [8.0, 11.3], tech: 62, industry: 50, naval: 20, airforce: 10, nuclear: 0, weaponized: 10, weaponizable: 55, weapons: [], dualUse: ["medtech", "software"], militarism: 10, island: false, pacifism: 90 },
  { name: "Nicaragua", iso: "NI", lon: [-87.7, -82.7], lat: [10.7, 15.1], tech: 35, industry: 30, naval: 20, airforce: 20, nuclear: 0, weaponized: 28, weaponizable: 30, weapons: ["armor"], dualUse: [], militarism: 55, island: false, pacifism: 30 },
  { name: "Honduras", iso: "HN", lon: [-89.4, -83.1], lat: [12.9, 16.6], tech: 35, industry: 32, naval: 20, airforce: 20, nuclear: 0, weaponized: 25, weaponizable: 28, weapons: ["small-arms"], dualUse: [], militarism: 50, island: false, pacifism: 35 },
  { name: "El Salvador", iso: "SV", lon: [-90.2, -87.6], lat: [13.1, 14.5], tech: 40, industry: 35, naval: 15, airforce: 20, nuclear: 0, weaponized: 25, weaponizable: 30, weapons: ["small-arms"], dualUse: ["software"], militarism: 50, island: false, pacifism: 35 },
  { name: "Guatemala", iso: "GT", lon: [-92.3, -88.1], lat: [13.7, 17.9], tech: 40, industry: 38, naval: 15, airforce: 20, nuclear: 0, weaponized: 28, weaponizable: 32, weapons: ["small-arms"], dualUse: [], militarism: 50, island: false, pacifism: 35 },
  { name: "Belize", iso: "BZ", lon: [-89.3, -87.7], lat: [15.8, 18.5], tech: 40, industry: 30, naval: 20, airforce: 10, nuclear: 0, weaponized: 15, weaponizable: 25, weapons: ["patrol-craft"], dualUse: [], militarism: 30, island: false, pacifism: 55 },

  // —— Mid-size countries ——
  { name: "United Kingdom", iso: "GB", lon: [-8.7, 1.8], lat: [49.8, 59.0], tech: 88, industry: 78, naval: 95, airforce: 85, nuclear: 92, weaponized: 90, weaponizable: 88, weapons: ["nukes-slbm", "carriers", "submarines", "fighters", "cyber"], dualUse: ["aerospace", "finance", "AI", "nuclear-power"], militarism: 55, island: true, pacifism: 45 },
  { name: "France", iso: "FR", lon: [-5.2, 9.6], lat: [41.3, 51.2], tech: 86, industry: 80, naval: 78, airforce: 88, nuclear: 95, weaponized: 90, weaponizable: 88, weapons: ["nukes", "carriers", "fighters", "submarines", "missiles"], dualUse: ["aerospace", "nuclear-power", "space-launch"], militarism: 50, island: false, pacifism: 45 },
  { name: "Spain", iso: "ES", lon: [-9.4, 3.4], lat: [35.9, 43.9], tech: 75, industry: 70, naval: 65, airforce: 60, nuclear: 5, weaponized: 58, weaponizable: 70, weapons: ["carriers-lite", "frigates", "fighters"], dualUse: ["shipyards", "autos", "renewables"], militarism: 40, island: false, pacifism: 55 },
  { name: "Italy", iso: "IT", lon: [6.6, 18.6], lat: [36.6, 47.2], tech: 78, industry: 75, naval: 70, airforce: 65, nuclear: 5, weaponized: 62, weaponizable: 75, weapons: ["carriers-lite", "frigates", "fighters", "armor"], dualUse: ["aerospace", "shipyards", "machinery"], militarism: 40, island: false, pacifism: 55 },
  { name: "Germany", iso: "DE", lon: [5.8, 15.1], lat: [47.2, 55.1], tech: 92, industry: 92, naval: 45, airforce: 70, nuclear: 12, weaponized: 65, weaponizable: 95, weapons: ["submarines", "armor", "air-defense", "fighters"], dualUse: ["autos", "chem", "machinery", "nuclear-power", "optics"], militarism: 38, island: false, pacifism: 65 },
  { name: "Greece", iso: "GR", lon: [19.3, 29.7], lat: [34.8, 41.8], tech: 65, industry: 55, naval: 60, airforce: 60, nuclear: 0, weaponized: 58, weaponizable: 55, weapons: ["frigates", "fighters", "armor"], dualUse: ["shipyards"], militarism: 55, island: false, pacifism: 35 },
  { name: "Turkey", iso: "TR", lon: [26.0, 45.0], lat: [35.8, 42.2], tech: 68, industry: 65, naval: 60, airforce: 70, nuclear: 10, weaponized: 75, weaponizable: 75, weapons: ["drones", "missiles", "frigates", "armor", "fighters"], dualUse: ["aerospace", "autos", "shipyards"], militarism: 70, island: false, pacifism: 25 },
  { name: "Egypt", iso: "EG", lon: [24.6, 37.0], lat: [21.9, 31.8], tech: 52, industry: 50, naval: 50, airforce: 60, nuclear: 5, weaponized: 60, weaponizable: 55, weapons: ["fighters", "armor", "frigates", "missiles"], dualUse: ["energy", "Suez"], militarism: 65, island: false, pacifism: 25 },
  { name: "Libya", iso: "LY", lon: [9.3, 25.2], lat: [19.5, 33.2], tech: 35, industry: 30, naval: 25, airforce: 30, nuclear: 0, weaponized: 35, weaponizable: 30, weapons: ["armor", "militias"], dualUse: ["energy"], militarism: 70, island: false, pacifism: 20 },
  { name: "Tunisia", iso: "TN", lon: [7.5, 11.6], lat: [30.2, 37.4], tech: 50, industry: 45, naval: 30, airforce: 30, nuclear: 0, weaponized: 32, weaponizable: 40, weapons: ["patrol-craft"], dualUse: ["ports"], militarism: 40, island: false, pacifism: 45 },
  { name: "Algeria", iso: "DZ", lon: [-8.7, 12.0], lat: [18.9, 37.2], tech: 48, industry: 45, naval: 40, airforce: 55, nuclear: 5, weaponized: 55, weaponizable: 50, weapons: ["fighters", "armor", "air-defense"], dualUse: ["energy"], militarism: 60, island: false, pacifism: 30 },
  { name: "Morocco", iso: "MA", lon: [-13.2, -1.0], lat: [27.6, 36.0], tech: 50, industry: 48, naval: 40, airforce: 50, nuclear: 0, weaponized: 50, weaponizable: 48, weapons: ["fighters", "drones", "armor"], dualUse: ["phosphates", "ports"], militarism: 55, island: false, pacifism: 35 },
  { name: "Western Sahara", iso: "EH", lon: [-17.2, -8.6], lat: [20.7, 27.7], tech: 25, industry: 20, naval: 15, airforce: 15, nuclear: 0, weaponized: 20, weaponizable: 15, weapons: ["irregular"], dualUse: [], militarism: 55, island: false, pacifism: 25 },
  { name: "Saudi Arabia", iso: "SA", lon: [34.5, 55.7], lat: [16.3, 32.2], tech: 65, industry: 55, naval: 45, airforce: 80, nuclear: 15, weaponized: 75, weaponizable: 70, weapons: ["fighters", "missiles", "air-defense", "armor"], dualUse: ["energy", "rocketry"], militarism: 65, island: false, pacifism: 25 },
  { name: "Yemen", iso: "YE", lon: [42.5, 54.0], lat: [12.1, 19.1], tech: 25, industry: 20, naval: 15, airforce: 15, nuclear: 0, weaponized: 35, weaponizable: 25, weapons: ["missiles", "drones", "irregular"], dualUse: [], militarism: 75, island: false, pacifism: 15 },
  { name: "Iraq", iso: "IQ", lon: [38.7, 48.6], lat: [29.0, 37.4], tech: 40, industry: 35, naval: 15, airforce: 35, nuclear: 5, weaponized: 45, weaponizable: 40, weapons: ["armor", "drones", "militia"], dualUse: ["energy"], militarism: 70, island: false, pacifism: 20 },
  { name: "Syria", iso: "SY", lon: [35.7, 42.4], lat: [32.3, 37.4], tech: 35, industry: 30, naval: 15, airforce: 30, nuclear: 5, weaponized: 50, weaponizable: 35, weapons: ["missiles", "armor", "air-defense"], dualUse: ["chem-legacy"], militarism: 80, island: false, pacifism: 10 },
  { name: "Iran", iso: "IR", lon: [44.0, 63.4], lat: [25.0, 39.9], tech: 60, industry: 55, naval: 40, airforce: 50, nuclear: 55, weaponized: 72, weaponizable: 80, weapons: ["missiles", "drones", "fast-boats", "air-defense", "proxies"], dualUse: ["enrichment", "rocketry", "drones", "space-launch"], militarism: 75, island: false, pacifism: 20 },
  { name: "Afghanistan", iso: "AF", lon: [60.5, 75.0], lat: [29.3, 38.6], tech: 25, industry: 18, naval: 0, airforce: 15, nuclear: 0, weaponized: 35, weaponizable: 20, weapons: ["small-arms", "irregular"], dualUse: [], militarism: 70, island: false, pacifism: 20 },
  { name: "Pakistan", iso: "PK", lon: [60.8, 77.1], lat: [23.6, 37.1], tech: 50, industry: 45, naval: 40, airforce: 60, nuclear: 82, weaponized: 78, weaponizable: 65, weapons: ["nukes", "missiles", "fighters", "armor"], dualUse: ["rocketry", "enrichment"], militarism: 75, island: false, pacifism: 20 },
  { name: "India", iso: "IN", lon: [68.0, 97.5], lat: [6.7, 35.6], tech: 72, industry: 68, naval: 65, airforce: 75, nuclear: 85, weaponized: 80, weaponizable: 82, weapons: ["nukes", "carriers", "missiles", "fighters", "submarines"], dualUse: ["space-launch", "IT", "pharma", "shipyards"], militarism: 60, island: false, pacifism: 35 },
  { name: "Myanmar", iso: "MM", lon: [92.1, 101.2], lat: [9.5, 28.6], tech: 32, industry: 30, naval: 25, airforce: 30, nuclear: 0, weaponized: 40, weaponizable: 30, weapons: ["fighters", "armor"], dualUse: [], militarism: 70, island: false, pacifism: 20 },
  { name: "Thailand", iso: "TH", lon: [97.3, 105.7], lat: [5.6, 20.5], tech: 58, industry: 60, naval: 45, airforce: 50, nuclear: 0, weaponized: 48, weaponizable: 55, weapons: ["fighters", "frigates", "armor"], dualUse: ["autos", "electronics"], militarism: 50, island: false, pacifism: 40 },
  { name: "Vietnam", iso: "VN", lon: [102.1, 109.6], lat: [8.4, 23.5], tech: 55, industry: 58, naval: 45, airforce: 50, nuclear: 0, weaponized: 55, weaponizable: 60, weapons: ["submarines", "missiles", "fighters"], dualUse: ["shipyards", "electronics"], militarism: 60, island: false, pacifism: 30 },
  { name: "Malaysia", iso: "MY", lon: [99.6, 119.3], lat: [0.8, 7.5], tech: 65, industry: 62, naval: 50, airforce: 45, nuclear: 0, weaponized: 45, weaponizable: 60, weapons: ["frigates", "fighters"], dualUse: ["electronics", "ports", "oil"], militarism: 40, island: true, pacifism: 50 },
  { name: "Indonesia", iso: "ID", lon: [95.0, 141.1], lat: [-11.1, 6.1], tech: 50, industry: 52, naval: 55, airforce: 40, nuclear: 0, weaponized: 45, weaponizable: 55, weapons: ["frigates", "fighters", "submarines"], dualUse: ["shipyards", "nickel", "ports"], militarism: 45, island: true, pacifism: 40 },
  { name: "Philippines", iso: "PH", lon: [116.9, 126.7], lat: [4.5, 21.2], tech: 50, industry: 45, naval: 40, airforce: 35, nuclear: 0, weaponized: 35, weaponizable: 45, weapons: ["patrol-craft", "fighters"], dualUse: ["shipyards", "electronics"], militarism: 45, island: true, pacifism: 40 },
  { name: "Japan", iso: "JP", lon: [129.0, 146.0], lat: [30.2, 45.6], tech: 94, industry: 90, naval: 90, airforce: 85, nuclear: 12, weaponized: 70, weaponizable: 98, weapons: ["destroyers", "submarines", "fighters", "missile-defense"], dualUse: ["nuclear-power", "rocketry", "robotics", "shipyards", "semiconductors"], militarism: 40, island: true, pacifism: 70 },
  { name: "Mongolia", iso: "MN", lon: [87.7, 119.9], lat: [41.5, 52.2], tech: 40, industry: 35, naval: 0, airforce: 25, nuclear: 0, weaponized: 30, weaponizable: 35, weapons: ["armor"], dualUse: ["mining"], militarism: 45, island: false, pacifism: 40 },
  { name: "Kazakhstan", iso: "KZ", lon: [46.4, 87.4], lat: [40.5, 55.5], tech: 50, industry: 48, naval: 10, airforce: 40, nuclear: 15, weaponized: 40, weaponizable: 55, weapons: ["air-defense", "armor"], dualUse: ["uranium", "spaceport", "energy"], militarism: 45, island: false, pacifism: 40 },
  { name: "Uzbekistan", iso: "UZ", lon: [55.9, 73.2], lat: [37.1, 45.6], tech: 42, industry: 40, naval: 5, airforce: 35, nuclear: 5, weaponized: 40, weaponizable: 40, weapons: ["armor", "fighters"], dualUse: ["gas", "cotton"], militarism: 50, island: false, pacifism: 35 },
  { name: "Turkmenistan", iso: "TM", lon: [52.4, 66.8], lat: [35.1, 42.9], tech: 35, industry: 35, naval: 15, airforce: 30, nuclear: 0, weaponized: 35, weaponizable: 35, weapons: ["armor"], dualUse: ["gas"], militarism: 55, island: false, pacifism: 30 },
  { name: "Kyrgyzstan", iso: "KG", lon: [69.2, 80.3], lat: [39.1, 43.3], tech: 35, industry: 30, naval: 0, airforce: 20, nuclear: 0, weaponized: 25, weaponizable: 30, weapons: ["small-arms"], dualUse: [], militarism: 45, island: false, pacifism: 40 },
  { name: "Tajikistan", iso: "TJ", lon: [67.3, 75.2], lat: [36.6, 41.1], tech: 32, industry: 28, naval: 0, airforce: 20, nuclear: 0, weaponized: 25, weaponizable: 28, weapons: ["small-arms"], dualUse: ["hydro"], militarism: 50, island: false, pacifism: 35 },
  { name: "Australia", iso: "AU", lon: [112.9, 154.0], lat: [-44.0, -10.0], tech: 82, industry: 70, naval: 75, airforce: 75, nuclear: 10, weaponized: 70, weaponizable: 80, weapons: ["submarines-plan", "fighters", "frigates", "missiles"], dualUse: ["mining", "space-tracking", "uranium"], militarism: 45, island: true, pacifism: 50 },
  { name: "Papua New Guinea", iso: "PG", lon: [140.8, 156.0], lat: [-11.7, -1.3], tech: 30, industry: 25, naval: 20, airforce: 10, nuclear: 0, weaponized: 15, weaponizable: 20, weapons: ["patrol-craft"], dualUse: ["mining"], militarism: 35, island: true, pacifism: 50 },
  { name: "New Caledonia", iso: "NC", lon: [163.0, 168.5], lat: [-22.8, -19.5], tech: 55, industry: 40, naval: 35, airforce: 20, nuclear: 0, weaponized: 25, weaponizable: 40, weapons: ["patrol-craft"], dualUse: ["nickel"], militarism: 30, island: true, pacifism: 55 },

  // —— Large countries / continents remaining ——
  { name: "United States", iso: "US", lon: [-125.0, -66.9], lat: [24.5, 49.4], tech: 95, industry: 90, naval: 98, airforce: 98, nuclear: 99, weaponized: 98, weaponizable: 95, weapons: ["nukes", "carriers", "stealth", "cyber", "satellites", "hypersonics", "drones"], dualUse: ["AI", "space-launch", "semiconductors", "biotech"], militarism: 55, island: false, pacifism: 35 },
  { name: "Alaska (US)", iso: "US-AK", lon: [-170.0, -130.0], lat: [54.0, 71.5], tech: 70, industry: 45, naval: 55, airforce: 70, nuclear: 60, weaponized: 65, weaponizable: 55, weapons: ["missile-defense", "fighters", "bases"], dualUse: ["energy"], militarism: 50, island: false, pacifism: 30 },
  { name: "Canada", iso: "CA", lon: [-141.0, -52.0], lat: [41.6, 70.0], tech: 80, industry: 72, naval: 50, airforce: 60, nuclear: 20, weaponized: 55, weaponizable: 80, weapons: ["frigates", "fighters", "arctic-patrol"], dualUse: ["uranium", "aerospace", "AI"], militarism: 30, island: false, pacifism: 65 },
  { name: "Mexico", iso: "MX", lon: [-118.5, -86.5], lat: [14.5, 32.8], tech: 58, industry: 62, naval: 35, airforce: 40, nuclear: 5, weaponized: 40, weaponizable: 55, weapons: ["patrol-craft", "armor"], dualUse: ["autos", "electronics", "energy"], militarism: 45, island: false, pacifism: 40 },
  { name: "Greenland", iso: "GL", lon: [-73.0, -12.0], lat: [59.5, 83.5], tech: 50, industry: 25, naval: 25, airforce: 20, nuclear: 10, weaponized: 20, weaponizable: 30, weapons: ["bases"], dualUse: ["rare-earths", "arctic"], militarism: 20, island: true, pacifism: 70 },
  { name: "Cuba Sea Approaches", iso: "CU2", lon: [-85.0, -74.0], lat: [19.5, 23.5], tech: 45, industry: 35, naval: 30, airforce: 35, nuclear: 5, weaponized: 40, weaponizable: 40, weapons: ["air-defense"], dualUse: ["biotech"], militarism: 55, island: true, pacifism: 30 },
  { name: "Colombia", iso: "CO", lon: [-79.1, -66.8], lat: [-4.3, 12.6], tech: 50, industry: 48, naval: 35, airforce: 45, nuclear: 0, weaponized: 50, weaponizable: 45, weapons: ["fighters", "armor", "patrol-craft"], dualUse: ["energy"], militarism: 55, island: false, pacifism: 30 },
  { name: "Venezuela", iso: "VE", lon: [-73.4, -59.7], lat: [0.6, 12.3], tech: 40, industry: 35, naval: 30, airforce: 40, nuclear: 0, weaponized: 45, weaponizable: 40, weapons: ["fighters", "armor"], dualUse: ["energy"], militarism: 60, island: false, pacifism: 25 },
  { name: "Brazil", iso: "BR", lon: [-74.0, -34.7], lat: [-33.8, 5.3], tech: 62, industry: 65, naval: 55, airforce: 55, nuclear: 20, weaponized: 55, weaponizable: 70, weapons: ["submarines", "fighters", "armor"], dualUse: ["aerospace", "uranium", "agritech", "shipyards"], militarism: 45, island: false, pacifism: 40 },
  { name: "Argentina", iso: "AR", lon: [-73.6, -53.5], lat: [-55.1, -21.7], tech: 60, industry: 55, naval: 45, airforce: 45, nuclear: 15, weaponized: 45, weaponizable: 65, weapons: ["submarines", "fighters"], dualUse: ["nuclear-power", "agritech", "space-launch"], militarism: 45, island: false, pacifism: 40 },
  { name: "Chile", iso: "CL", lon: [-75.7, -66.9], lat: [-56.0, -17.5], tech: 65, industry: 55, naval: 55, airforce: 50, nuclear: 5, weaponized: 50, weaponizable: 60, weapons: ["frigates", "fighters", "submarines"], dualUse: ["copper", "lithium", "astronomy"], militarism: 45, island: false, pacifism: 40 },
  { name: "Peru", iso: "PE", lon: [-81.4, -68.6], lat: [-18.4, -0.0], tech: 48, industry: 45, naval: 35, airforce: 35, nuclear: 0, weaponized: 40, weaponizable: 42, weapons: ["frigates", "fighters"], dualUse: ["mining"], militarism: 45, island: false, pacifism: 40 },
  { name: "Bolivia", iso: "BO", lon: [-69.7, -57.4], lat: [-22.9, -9.6], tech: 38, industry: 35, naval: 5, airforce: 25, nuclear: 0, weaponized: 28, weaponizable: 40, weapons: ["armor"], dualUse: ["lithium"], militarism: 45, island: false, pacifism: 40 },
  { name: "Paraguay", iso: "PY", lon: [-62.7, -54.2], lat: [-27.7, -19.2], tech: 40, industry: 35, naval: 10, airforce: 20, nuclear: 0, weaponized: 25, weaponizable: 35, weapons: ["small-arms"], dualUse: ["hydro"], militarism: 40, island: false, pacifism: 45 },
  { name: "Uruguay", iso: "UY", lon: [-58.5, -53.0], lat: [-35.0, -30.0], tech: 60, industry: 50, naval: 30, airforce: 25, nuclear: 0, weaponized: 25, weaponizable: 50, weapons: ["patrol-craft"], dualUse: ["software", "agritech"], militarism: 30, island: false, pacifism: 60 },
  { name: "Ecuador", iso: "EC", lon: [-81.1, -75.1], lat: [-5.1, 1.5], tech: 45, industry: 40, naval: 30, airforce: 30, nuclear: 0, weaponized: 32, weaponizable: 40, weapons: ["patrol-craft"], dualUse: ["oil", "ports"], militarism: 45, island: false, pacifism: 40 },
  { name: "South Africa", iso: "ZA", lon: [16.3, 33.0], lat: [-35.0, -22.0], tech: 60, industry: 55, naval: 40, airforce: 50, nuclear: 15, weaponized: 55, weaponizable: 65, weapons: ["fighters", "armor", "patrol-craft"], dualUse: ["nuclear-power", "mining", "space"], militarism: 50, island: false, pacifism: 40 },
  { name: "Nigeria", iso: "NG", lon: [2.6, 14.7], lat: [4.2, 13.9], tech: 40, industry: 42, naval: 30, airforce: 35, nuclear: 0, weaponized: 40, weaponizable: 45, weapons: ["fighters", "patrol-craft"], dualUse: ["energy", "tech-hubs"], militarism: 55, island: false, pacifism: 30 },
  { name: "Ethiopia", iso: "ET", lon: [32.9, 48.0], lat: [3.3, 14.9], tech: 35, industry: 32, naval: 5, airforce: 35, nuclear: 0, weaponized: 40, weaponizable: 35, weapons: ["drones", "armor"], dualUse: ["hydro"], militarism: 65, island: false, pacifism: 25 },
  { name: "Kenya", iso: "KE", lon: [33.9, 42.0], lat: [-4.8, 5.1], tech: 45, industry: 40, naval: 25, airforce: 30, nuclear: 0, weaponized: 35, weaponizable: 45, weapons: ["armor", "patrol-craft"], dualUse: ["tech-hubs", "ports"], militarism: 50, island: false, pacifism: 35 },
  { name: "Tanzania", iso: "TZ", lon: [29.3, 40.5], lat: [-11.8, -0.9], tech: 35, industry: 32, naval: 20, airforce: 20, nuclear: 0, weaponized: 28, weaponizable: 30, weapons: ["patrol-craft"], dualUse: ["ports"], militarism: 40, island: false, pacifism: 45 },
  { name: "DR Congo", iso: "CD", lon: [12.0, 31.4], lat: [-13.5, 5.4], tech: 25, industry: 28, naval: 10, airforce: 15, nuclear: 0, weaponized: 30, weaponizable: 40, weapons: ["irregular", "small-arms"], dualUse: ["cobalt", "minerals"], militarism: 60, island: false, pacifism: 25 },
  { name: "Angola", iso: "AO", lon: [11.6, 24.1], lat: [-18.1, -4.3], tech: 35, industry: 35, naval: 25, airforce: 30, nuclear: 0, weaponized: 40, weaponizable: 40, weapons: ["fighters", "armor"], dualUse: ["energy"], militarism: 55, island: false, pacifism: 30 },
  { name: "Mozambique", iso: "MZ", lon: [30.1, 40.9], lat: [-26.9, -10.4], tech: 30, industry: 28, naval: 20, airforce: 20, nuclear: 0, weaponized: 25, weaponizable: 28, weapons: ["patrol-craft"], dualUse: ["gas"], militarism: 45, island: false, pacifism: 40 },
  { name: "Ghana", iso: "GH", lon: [-3.3, 1.3], lat: [4.7, 11.2], tech: 42, industry: 38, naval: 25, airforce: 25, nuclear: 0, weaponized: 28, weaponizable: 40, weapons: ["patrol-craft"], dualUse: ["ports", "tech-hubs"], militarism: 40, island: false, pacifism: 45 },
  { name: "Ivory Coast", iso: "CI", lon: [-8.7, -2.4], lat: [4.3, 10.8], tech: 40, industry: 38, naval: 20, airforce: 20, nuclear: 0, weaponized: 28, weaponizable: 35, weapons: ["armor"], dualUse: ["ports"], militarism: 45, island: false, pacifism: 40 },
  { name: "Senegal", iso: "SN", lon: [-17.6, -11.3], lat: [12.3, 16.8], tech: 40, industry: 35, naval: 30, airforce: 25, nuclear: 0, weaponized: 30, weaponizable: 35, weapons: ["patrol-craft"], dualUse: ["ports"], militarism: 40, island: false, pacifism: 45 },
  { name: "Sudan", iso: "SD", lon: [21.8, 38.7], lat: [8.6, 22.3], tech: 28, industry: 25, naval: 15, airforce: 25, nuclear: 0, weaponized: 40, weaponizable: 25, weapons: ["armor", "irregular"], dualUse: [], militarism: 75, island: false, pacifism: 15 },
  { name: "South Sudan", iso: "SS", lon: [24.1, 35.9], lat: [3.4, 12.3], tech: 20, industry: 18, naval: 5, airforce: 10, nuclear: 0, weaponized: 30, weaponizable: 15, weapons: ["irregular"], dualUse: ["oil"], militarism: 70, island: false, pacifism: 20 },
  { name: "Somalia", iso: "SO", lon: [40.9, 51.5], lat: [-1.7, 12.0], tech: 20, industry: 15, naval: 15, airforce: 10, nuclear: 0, weaponized: 30, weaponizable: 15, weapons: ["irregular", "fast-boats"], dualUse: ["ports"], militarism: 70, island: false, pacifism: 15 },
  { name: "Madagascar", iso: "MG", lon: [43.1, 50.6], lat: [-25.7, -11.9], tech: 30, industry: 25, naval: 20, airforce: 15, nuclear: 0, weaponized: 18, weaponizable: 25, weapons: ["patrol-craft"], dualUse: ["minerals"], militarism: 35, island: true, pacifism: 50 },

  // —— Major powers covering remaining land ——
  { name: "China", iso: "CN", lon: [73.0, 135.0], lat: [18.0, 53.6], tech: 85, industry: 95, naval: 80, airforce: 85, nuclear: 90, weaponized: 90, weaponizable: 92, weapons: ["nukes", "carriers", "missiles", "cyber", "hypersonics", "drones"], dualUse: ["shipyards", "electronics", "space-launch", "AI", "rare-earths"], militarism: 65, island: false, pacifism: 25 },
  { name: "Russia", iso: "RU", lon: [27.0, 180.0], lat: [41.0, 77.0], tech: 70, industry: 65, naval: 60, airforce: 75, nuclear: 99, weaponized: 92, weaponizable: 75, weapons: ["nukes", "hypersonics", "air-defense", "submarines", "missiles", "armor"], dualUse: ["space-launch", "nuclear-power", "energy", "arctic"], militarism: 80, island: false, pacifism: 15 },
  { name: "Russia West", iso: "RU-W", lon: [19.5, 40.0], lat: [44.0, 70.0], tech: 70, industry: 65, naval: 50, airforce: 75, nuclear: 98, weaponized: 90, weaponizable: 72, weapons: ["nukes", "air-defense", "armor", "missiles"], dualUse: ["energy", "nuclear-power"], militarism: 80, island: false, pacifism: 15 },

  // —— Broad regional fallbacks (last) ——
  { name: "Central America", iso: "CAM", lon: [-92.5, -77.0], lat: [7.0, 18.5], tech: 38, industry: 35, naval: 22, airforce: 20, nuclear: 0, weaponized: 25, weaponizable: 30, weapons: ["small-arms"], dualUse: [], militarism: 50, island: false, pacifism: 35 },
  { name: "Caribbean", iso: "CAR", lon: [-85.0, -59.0], lat: [10.0, 27.0], tech: 42, industry: 32, naval: 40, airforce: 20, nuclear: 0, weaponized: 22, weaponizable: 30, weapons: ["patrol-craft"], dualUse: ["ports"], militarism: 35, island: true, pacifism: 50 },
  { name: "West Africa", iso: "WAF", lon: [-18.0, 10.0], lat: [4.0, 28.0], tech: 32, industry: 30, naval: 22, airforce: 20, nuclear: 0, weaponized: 28, weaponizable: 28, weapons: ["small-arms"], dualUse: [], militarism: 55, island: false, pacifism: 30 },
  { name: "Central Africa", iso: "CAF", lon: [8.0, 32.0], lat: [-10.0, 10.0], tech: 25, industry: 24, naval: 10, airforce: 15, nuclear: 0, weaponized: 28, weaponizable: 25, weapons: ["irregular"], dualUse: ["minerals"], militarism: 55, island: false, pacifism: 30 },
  { name: "East Africa", iso: "EAF", lon: [28.0, 52.0], lat: [-12.0, 18.0], tech: 32, industry: 30, naval: 20, airforce: 22, nuclear: 0, weaponized: 30, weaponizable: 28, weapons: ["small-arms"], dualUse: [], militarism: 55, island: false, pacifism: 30 },
  { name: "Southern Africa", iso: "SAF", lon: [12.0, 41.0], lat: [-35.0, -10.0], tech: 45, industry: 42, naval: 28, airforce: 30, nuclear: 5, weaponized: 35, weaponizable: 40, weapons: ["armor"], dualUse: ["mining"], militarism: 45, island: false, pacifism: 40 },
  { name: "Pacific Islands", iso: "PAC", lon: [130.0, 180.0], lat: [-25.0, 20.0], tech: 28, industry: 18, naval: 35, airforce: 10, nuclear: 0, weaponized: 12, weaponizable: 20, weapons: ["patrol-craft"], dualUse: ["fisheries"], militarism: 25, island: true, pacifism: 60 },
  { name: "Siberia / Far East", iso: "SIB", lon: [60.0, 180.0], lat: [50.0, 75.0], tech: 48, industry: 42, naval: 35, airforce: 50, nuclear: 70, weaponized: 65, weaponizable: 50, weapons: ["nukes", "air-defense", "bases"], dualUse: ["energy", "arctic"], militarism: 60, island: false, pacifism: 25 },
];

const DEFAULT_PROFILE = {
  name: "Remote / Uncharted",
  iso: "XX",
  tech: 35,
  industry: 30,
  naval: 20,
  airforce: 15,
  nuclear: 0,
  weaponized: 15,
  weaponizable: 20,
  weapons: [],
  dualUse: [],
  island: false,
  pacifism: 40,
  militarism: 40,
};

/** Detailed country profiles keyed by ISO_A2 (skip subregion entries). */
const PROFILE_BY_ISO = (() => {
  const m = Object.create(null);
  for (const p of GEO_PROFILES) {
    if (p.iso && !p.subregion) m[String(p.iso).toUpperCase()] = p;
  }
  m.UK = m.GB;
  return m;
})();

const CONTINENT_DEFAULTS = {
  "North America": { tech: 70, industry: 68, naval: 45, airforce: 50, nuclear: 20, weaponized: 50, weaponizable: 55, militarism: 45, pacifism: 40, island: false },
  "South America": { tech: 50, industry: 48, naval: 35, airforce: 35, nuclear: 5, weaponized: 40, weaponizable: 45, militarism: 45, pacifism: 40, island: false },
  Europe: { tech: 75, industry: 72, naval: 45, airforce: 50, nuclear: 15, weaponized: 50, weaponizable: 65, militarism: 40, pacifism: 55, island: false },
  Africa: { tech: 35, industry: 32, naval: 22, airforce: 22, nuclear: 0, weaponized: 30, weaponizable: 30, militarism: 50, pacifism: 35, island: false },
  Asia: { tech: 55, industry: 55, naval: 35, airforce: 40, nuclear: 15, weaponized: 45, weaponizable: 50, militarism: 55, pacifism: 35, island: false },
  Oceania: { tech: 55, industry: 45, naval: 45, airforce: 35, nuclear: 0, weaponized: 30, weaponizable: 40, militarism: 35, pacifism: 55, island: true },
  Antarctica: { tech: 20, industry: 10, naval: 10, airforce: 5, nuclear: 0, weaponized: 5, weaponizable: 10, militarism: 10, pacifism: 80, island: false },
};

function lonLatFromGrid(gx, gy, cols, rows) {
  const lon = (gx / cols) * 360 - 180;
  const lat = 90 - (gy / rows) * 180;
  return { lon, lat };
}

function matchBox(list, lon, lat) {
  if (!list) return null;
  for (const p of list) {
    const [lon0, lon1] = p.lon;
    const [lat0, lat1] = p.lat;
    if (lon >= lon0 && lon <= lon1 && lat >= lat0 && lat <= lat1) return p;
  }
  return null;
}

/**
 * Row-bucketed subregion boxes: a cell only tests the dozen-or-so boxes whose
 * latitude span covers its grid row instead of every box in GEO_SUBREGIONS.
 * Order inside a bucket preserves list order, so "first box wins" is unchanged.
 */
let SUBREGION_ROWS = null;
let SUBREGION_ROWS_N = 0;

function buildSubregionRows(rows) {
  const list = typeof GEO_SUBREGIONS !== "undefined" ? GEO_SUBREGIONS : [];
  const buckets = new Array(rows).fill(null);
  for (const p of list) {
    const [lat0, lat1] = p.lat;
    // lat(y) = 90 - y/rows*180 → conservative row span (±1), exact test still runs
    const yA = Math.max(0, Math.floor(((90 - lat1) / 180) * rows) - 1);
    const yB = Math.min(rows - 1, Math.ceil(((90 - lat0) / 180) * rows) + 1);
    for (let y = yA; y <= yB; y++) (buckets[y] || (buckets[y] = [])).push(p);
  }
  SUBREGION_ROWS = buckets;
  SUBREGION_ROWS_N = rows;
}

function matchSubregion(lon, lat, gy, rows) {
  if (gy == null || !rows) {
    return matchBox(typeof GEO_SUBREGIONS !== "undefined" ? GEO_SUBREGIONS : null, lon, lat);
  }
  if (!SUBREGION_ROWS || SUBREGION_ROWS_N !== rows) buildSubregionRows(rows);
  const b = SUBREGION_ROWS[gy];
  return b ? matchBox(b, lon, lat) : null;
}

/** Fine subregion first, then country lon/lat boxes. */
function profileAtLonLat(lon, lat) {
  return (
    matchBox(typeof GEO_SUBREGIONS !== "undefined" ? GEO_SUBREGIONS : null, lon, lat) ||
    matchBox(GEO_PROFILES, lon, lat) ||
    DEFAULT_PROFILE
  );
}

/** Country-level profile per WORLD_META entry — resolved once, not per cell. */
const META_PROFILE_CACHE = new Map();

function countryProfileForMeta(meta) {
  let prof = META_PROFILE_CACHE.get(meta);
  if (prof) return prof;
  const iso = String(meta.iso || "").toUpperCase();
  const iso3 = String(meta.iso3 || "").toUpperCase();
  const hit =
    PROFILE_BY_ISO[iso] ||
    PROFILE_BY_ISO[iso3] ||
    GEO_PROFILES.find((p) => p.name === meta.name || (p.iso && p.iso.toUpperCase() === iso));
  if (hit) {
    prof = { ...hit, name: meta.name, iso: hit.iso || iso };
  } else {
    const base = CONTINENT_DEFAULTS[meta.continent] || DEFAULT_PROFILE;
    prof = {
      ...DEFAULT_PROFILE,
      ...base,
      name: meta.name,
      iso,
      weapons: [],
      dualUse: [],
    };
  }
  META_PROFILE_CACHE.set(meta, prof);
  return prof;
}

function profileFromMeta(meta, lon, lat, sub = matchSubregion(lon, lat)) {
  // Always prefer fine-grained subregion under the cursor
  if (sub) {
    return {
      ...sub,
      country: meta?.name || null,
      iso: meta?.iso || sub.iso || null,
    };
  }
  if (meta) return countryProfileForMeta(meta);
  return profileAtLonLat(lon, lat);
}

/** Lazy per-cell profile cache — same values as live lookup, O(1) after first hit. */
const PROFILE_CACHE = [];

function profileAtCell(gx, gy, cols, rows) {
  const i = gy * cols + gx;
  const hit = PROFILE_CACHE[i];
  if (hit) return hit;
  const { lon, lat } = lonLatFromGrid(gx, gy, cols, rows);
  const sub = matchSubregion(lon, lat, gy, rows);
  const prof =
    typeof countryMetaAt === "function"
      ? profileFromMeta(countryMetaAt(gx, gy), lon, lat, sub)
      : sub || matchBox(GEO_PROFILES, lon, lat) || DEFAULT_PROFILE;
  PROFILE_CACHE[i] = prof;
  return prof;
}

/* ------------------------------------------------------------------------ */
/* Region index: every land cell → one region (city / subregion / country).  */
/* Colony stats aggregate over ~300 regions instead of ~100k cells per tick. */
/* ------------------------------------------------------------------------ */

let CELL_REGION = null; // Int16Array, -1 for water
let REGIONS = null; // [{id,name,prof,cells,coast,value,hub,base,cellList}]
let REGION_BY_NAME = null;

function regionHubFlag(prof) {
  return !!prof.hub || (prof.tech || 0) >= 78;
}

function ensureRegionIndex() {
  if (CELL_REGION) return;
  if (typeof ensureMapCaches === "function") ensureMapCaches();
  const cols = MAP_COLS;
  const rows = MAP_ROWS;
  const cell = new Int16Array(cols * rows).fill(-1);
  const regions = [];
  const byName = new Map();
  const land = LAND_CELLS;
  const coastFlag = COAST_FLAG;
  const lists = [];
  for (let li = 0; li < land.length; li++) {
    const i = land[li];
    const prof = profileAtCell(i % cols, (i / cols) | 0, cols, rows);
    let id = byName.get(prof.name);
    if (id === undefined) {
      id = regions.length;
      byName.set(prof.name, id);
      regions.push({
        id,
        name: prof.name,
        prof,
        cells: 0,
        coast: 0,
        value: targetValueScore(prof),
        hub: regionHubFlag(prof),
        base: !!prof.base,
        cellList: null,
      });
      lists.push([]);
    }
    const r = regions[id];
    r.cells++;
    if (coastFlag && coastFlag[i]) r.coast++;
    lists[id].push(i);
    cell[i] = id;
  }
  const lm = typeof LANDMASS !== "undefined" ? LANDMASS : null;
  for (let id = 0; id < regions.length; id++) {
    const R = regions[id];
    const list = Int32Array.from(lists[id]);
    R.cellList = list;
    // Centroid + dominant landmass (for "far from core" / "cut off" strategy checks)
    let sx = 0, sy = 0;
    const lmCount = new Map();
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      sx += i % cols;
      sy += (i / cols) | 0;
      if (lm) lmCount.set(lm[i], (lmCount.get(lm[i]) || 0) + 1);
    }
    R.cx = sx / list.length;
    R.cy = sy / list.length;
    let bestLm = -1, bestC = -1;
    for (const [k, c] of lmCount) if (c > bestC) { bestC = c; bestLm = k; }
    R.landmass = bestLm;
  }
  CELL_REGION = cell;
  REGIONS = regions;
  REGION_BY_NAME = byName;
}

/** Share-of-region presence curve: footholds count a little, full control counts fully. */
function regionPresence(owned, total) {
  if (owned <= 0) return 0;
  const frac = Math.min(1, owned / Math.max(1, total));
  return Math.min(1, 0.35 * Math.sqrt(Math.min(1, owned / 12)) + 0.65 * Math.sqrt(frac));
}

/** Capabilities implied by fielded-weapons tags (shared by combat + nuclear code). */
function armsCapabilities(weapons) {
  const caps = {
    carriers: false,
    subs: false,
    secondStrike: false,
    abm: 0,
    penetration: 0,
    stealth: false,
  };
  for (const raw of weapons || []) {
    const w = String(raw).toLowerCase();
    if (w.includes("carrier")) caps.carriers = true;
    if (w.includes("submarine") || w.includes("slbm")) caps.subs = true;
    if (w.includes("nuke")) caps.nukes = true;
    if (w.includes("slbm")) caps.secondStrike = true;
    if (w.includes("missile-defense") || w.includes("abm")) caps.abm = Math.max(caps.abm, 65);
    else if (w.includes("air-defense")) caps.abm = Math.max(caps.abm, 42);
    if (w.includes("hypersonic")) caps.penetration += 18;
    if (w.includes("ballistic")) caps.penetration += 10;
    if (w.includes("slbm")) caps.penetration += 8;
    if (w.includes("stealth")) {
      caps.stealth = true;
      caps.penetration += 6;
    }
  }
  // Boomer fleets survive a first strike; sub + nuke combos count as second-strike too
  if (caps.subs && caps.nukes) caps.secondStrike = true;
  return caps;
}

/**
 * Apply lasting nuke ruin to a city/subregion profile.
 * ruin: { techMul, milMul, hubDead, baseDead }
 */
function applyRegionRuin(prof, ruinMap) {
  if (!prof || !ruinMap || !ruinMap.size) return prof;
  const r = ruinMap.get(prof.name);
  if (!r) return prof;
  const techMul = r.techMul ?? 1;
  const milMul = r.milMul ?? 1;
  return {
    ...prof,
    tech: Math.round((prof.tech || 0) * techMul),
    industry: Math.round((prof.industry || 0) * techMul),
    weaponizable: Math.round((prof.weaponizable || 0) * techMul),
    weaponized: Math.round((prof.weaponized || 0) * milMul),
    airforce: Math.round((prof.airforce || 0) * milMul),
    naval: Math.round((prof.naval || 0) * (0.55 + 0.45 * milMul)),
    nuclear: Math.round((prof.nuclear || 0) * milMul),
    nukeDef: r.baseDead ? 0 : Math.round((prof.nukeDef || 0) * milMul),
    hub: r.hubDead ? false : !!prof.hub,
    base: r.baseDead ? false : !!prof.base,
    ruined: true,
    ruinLevel: Math.round((1 - Math.min(techMul, milMul)) * 100),
  };
}

/** Warm profiles + region index so war ticks don't hitch on first conquest. */
function warmProfileCache() {
  ensureRegionIndex();
}

function topTags(tagCounts, limit = 5) {
  return [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([t]) => t);
}

const BLEND_KEYS = [
  "tech",
  "industry",
  "naval",
  "airforce",
  "nuclear",
  "weaponized",
  "weaponizable",
  "militarism",
  "pacifism",
];

function emptyBlend() {
  return {
    ...DEFAULT_PROFILE,
    regions: [],
    hubs: [],
    weapons: [],
    dualUse: [],
    techPower: 0,
    industryPower: 0,
    peakTech: 0,
    arsenal: 0,
    nukeDefense: 0,
    navalTop: 0,
    airTop: 0,
  };
}

/**
 * Aggregate colony stats from per-region cell counts (O(regions), not O(cells)).
 * - Cell-weighted averages for mood / arms (display + soft combat mods)
 * - Navy / air use a "peak asset" blend: the best fleet / air base you hold
 *   still anchors your force even when you conquer a huge low-tech hinterland.
 * - Additive techPower: each DISTINCT region contributes a hub score scaled by
 *   how much of that region you actually control, so a sliver of a continent
 *   is worth less than the whole of a small city hub.
 * - Nuclear: homeland peak scaled by presence; arsenal (warheads) sums over
 *   nuclear regions so Russia-sized complexes field more than one silo field.
 * @param {Int32Array} counts owned cells per region id
 * @param {Map<string, object>|null} ruinMap lasting nuke devastation by region name
 */
function blendRegionCounts(counts, ruinMap) {
  ensureRegionIndex();
  const out = emptyBlend();
  for (const k of BLEND_KEYS) out[k] = 0;
  const hasRuin = !!(ruinMap && ruinMap.size);
  const weaponCounts = new Map();
  const dualCounts = new Map();
  const held = [];
  let n = 0;
  let islandVotes = 0;
  let peakTech = 0;

  for (let id = 0; id < REGIONS.length; id++) {
    const c = counts[id];
    if (!c) continue;
    const R = REGIONS[id];
    const prof = hasRuin ? applyRegionRuin(R.prof, ruinMap) : R.prof;
    n += c;
    for (const k of BLEND_KEYS) out[k] += (prof[k] || 0) * c;
    if (prof.island) islandVotes += c;
    peakTech = Math.max(peakTech, prof.tech || 0);
    const w = prof.weapons;
    if (w) for (let t = 0; t < w.length; t++) weaponCounts.set(w[t], (weaponCounts.get(w[t]) || 0) + c);
    const d = prof.dualUse;
    if (d) for (let t = 0; t < d.length; t++) dualCounts.set(d[t], (dualCounts.get(d[t]) || 0) + c);
    held.push({ R, c, prof });
  }
  if (!n) return out;

  for (const k of BLEND_KEYS) out[k] = Math.round(out[k] / n);
  out.island = islandVotes / n >= 0.28;
  out.peakTech = peakTech;

  let techPower = Math.sqrt(n) * 1.8; // land-size baseline
  let industryPower = Math.sqrt(n) * 1.5;
  let navalTop = 0;
  let airTop = 0;
  let nuclear = 0;
  let arsenal = 0;
  let nukeDef = 0;
  const hubs = [];

  for (let h = 0; h < held.length; h++) {
    const { R, c, prof } = held[h];
    const presence = regionPresence(c, R.cells);
    const frac = c / R.cells;
    const tech = prof.tech || 0;
    const industry = prof.industry || 0;
    const quality = Math.max(0, tech - 28);
    const isHub = regionHubFlag(prof);
    // Contested hubs only pay out fully once you hold most of them
    const hubMul = isHub ? 1 + 0.4 * Math.min(1, frac * 1.6) : 1;
    const contribution = Math.pow(quality, 1.12) * (0.25 + 0.75 * presence) * hubMul;
    techPower += contribution;
    industryPower += Math.pow(Math.max(0, industry - 25), 1.05) * (0.3 + 0.7 * presence);

    // Peak military assets — a fleet base you barely hold is a partial fleet
    const assetScale = 0.55 + 0.45 * presence;
    navalTop = Math.max(navalTop, (prof.naval || 0) * assetScale);
    airTop = Math.max(airTop, (prof.airforce || 0) * assetScale);

    const nuc = prof.nuclear || 0;
    nuclear = Math.max(nuclear, nuc * (0.6 + 0.4 * presence));
    if (nuc >= 50) {
      const t = (nuc - 40) / 60;
      arsenal += t * t * presence * (isHub || prof.base ? 1.6 : 1);
    }
    nukeDef = Math.max(nukeDef, (prof.nukeDef || 0) * (0.5 + 0.5 * presence));

    hubs.push({
      name: R.name,
      tech: Math.round(tech),
      cells: c,
      share: Math.round(frac * 100),
      contribution: Math.round(contribution),
      hub: isHub,
      base: !!prof.base,
      nukeDef: prof.nukeDef || 0,
    });
  }
  hubs.sort((a, b) => b.contribution - a.contribution);
  out.hubs = hubs.slice(0, 12);
  out.regionCount = held.length;
  out.coreRegion = hubs[0]?.name || null;
  out.techPower = Math.round(techPower);
  out.industryPower = Math.round(industryPower);
  out.nuclear = Math.round(nuclear);
  out.arsenal = arsenal;
  out.navalTop = Math.round(navalTop);
  out.airTop = Math.round(airTop);
  // Cell-average is diluted by hinterland; anchor on the best asset you hold
  out.naval = Math.round(0.55 * navalTop + 0.45 * out.naval);
  out.airforce = Math.round(0.55 * airTop + 0.45 * out.airforce);

  // Nation-wide missile / ABM defense: local sites, fielded interceptors, air force, tech
  out.weapons = topTags(weaponCounts, 8);
  out.dualUse = topTags(dualCounts, 8);
  const caps = armsCapabilities(out.weapons);
  nukeDef = Math.max(nukeDef, caps.abm);
  nukeDef = Math.max(
    nukeDef,
    (out.airforce || 0) * 0.3 + (out.nuclear || 0) * 0.2 + (out.tech || 0) * 0.15
  );
  out.nukeDefense = Math.min(100, Math.round(nukeDef));

  held.sort((a, b) => b.c - a.c);
  out.regions = held
    .slice(0, 8)
    .map(({ R, c }) => ({ name: R.name, share: Math.round((100 * c) / n) }));
  out.name = out.regions[0]?.name || DEFAULT_PROFILE.name;
  return out;
}

/** Legacy sample-list entry point — maps cell profiles to region counts. */
function blendProfiles(samples) {
  ensureRegionIndex();
  const counts = new Int32Array(REGIONS.length);
  for (const s of samples) {
    const id = REGION_BY_NAME.get(s.name);
    if (id !== undefined) counts[id]++;
  }
  return blendRegionCounts(counts, null);
}

function targetValueScore(prof) {
  if (!prof) return 0;
  let v = (prof.tech || 0) * 0.9 + (prof.industry || 0) * 0.35;
  v += (prof.weaponized || 0) * 0.45 + (prof.airforce || 0) * 0.4;
  v += (prof.nuclear || 0) * 0.5 + (prof.militarism || 0) * 0.25;
  if (prof.hub) v += 85;
  if (prof.base) v += 95;
  return v;
}

function techPowerLabel(techPower) {
  if (techPower >= 400) return "Superpower tech base";
  if (techPower >= 250) return "Multi-hub powerhouse";
  if (techPower >= 140) return "Strong regional tech";
  if (techPower >= 70) return "Single-hub / modest";
  return "Low tech base";
}

function warResponseLabel(militarism, pacifism) {
  const net = militarism - pacifism;
  if (net >= 35) return "Aggressive — public backs rapid conquest";
  if (net >= 15) return "Hardline — accepts high war costs";
  if (net >= -10) return "Pragmatic — supports defensive wars";
  if (net >= -30) return "Cautious — morale drops in long wars";
  return "Pacifist — strong resistance to offensive war";
}

function techTier(tech) {
  if (tech >= 90) return "Cutting-edge";
  if (tech >= 75) return "Advanced";
  if (tech >= 55) return "Industrial";
  if (tech >= 40) return "Developing";
  return "Low-tech";
}

function weaponLabel(weaponized, weaponizable) {
  if (weaponized >= 85) return "Fully weaponized arsenal";
  if (weaponized >= 65) return "Heavy conventional + special weapons";
  if (weaponized >= 40) return "Fielded modern arms";
  if (weaponizable >= 70) return "Mostly dual-use — can militarize fast";
  if (weaponizable >= 45) return "Limited arms, some convertible industry";
  return "Lightly armed";
}
