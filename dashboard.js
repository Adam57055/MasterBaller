(() => {
  "use strict";

  const RESULT_KEY = "masterballerResults";
  const HISTORY_KEY = "masterballerAssessmentHistory";
  const SAVED_KEY = "masterballerDashboardSaved";
  const TASK_KEY = "masterballerTrainingTasks";

  const scoredTests = [
    { key: "passing", label: "Passing", note: "Accurate passes", icon: "◎" },
    { key: "shooting", label: "Shooting", note: "Shots on target", icon: "↗" },
    { key: "defending", label: "Defense", note: "Successful 1v1 stops", icon: "◇" },
    { key: "possession", label: "Ball retention", note: "Successful attempts", icon: "◉" },
    { key: "goalkeeping", label: "Goalkeeping", note: "Saves", icon: "⌁" }
  ];

  const measurementLabels = {
    sprint: "30m sprint",
    distance: "6-minute distance",
    dribbling: "6-cone dribbling",
    passing: "Accurate passes",
    shooting: "Shots on target",
    defending: "1v1 defensive stops",
    interceptions: "Interceptions",
    possession: "Ball-retention attempts",
    goalkeeping: "Goalkeeping saves",
    communication: "Useful instructions"
  };

  const $ = id => document.getElementById(id);
  const safeParse = (value, fallback) => {
    try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
  };
  const clamp = (n, min = 0, max = 100) => Math.min(max, Math.max(min, n));
  const toPercent = value => clamp((Number(value) / 10) * 100);
  const formatDate = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unknown date" :
      date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  function readHistory() {
    const value = safeParse(localStorage.getItem(HISTORY_KEY), []);
    return Array.isArray(value) ? value.filter(item => item && item.stats) : [];
  }

  function saveCurrentAssessment() {
    const current = safeParse(sessionStorage.getItem(RESULT_KEY), null);
    if (!current || !current.stats || typeof current.stats !== "object") return current;

    const valid = scoredTests.every(({ key }) =>
      Number.isFinite(Number(current.stats[key])) &&
      Number(current.stats[key]) >= 0 && Number(current.stats[key]) <= 10
    );
    if (!valid) return current;

    const fingerprint = JSON.stringify(current.stats);
    if (sessionStorage.getItem(SAVED_KEY) !== fingerprint) {
      const history = readHistory();
      history.push({
        id: Date.now(),
        date: new Date().toISOString(),
        stats: current.stats,
        analysis: current.analysis || "",
        average: getAverage(current.stats)
      });
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-20)));
      sessionStorage.setItem(SAVED_KEY, fingerprint);
    }
    return current;
  }

  function getAverage(stats) {
    const values = scoredTests.map(({ key }) => Number(stats[key]));
    if (values.some(value => !Number.isFinite(value))) return 0;
    return Math.round(values.reduce((sum, value) => sum + toPercent(value), 0) / values.length);
  }

  function renderScore(stats, history) {
    const average = getAverage(stats);
    $("overall-score").textContent = average;
    $("score-caption").textContent = "Average across five scored drills";
    $("score-status").textContent =
      average >= 80 ? "Strong results." : average >= 60 ? "Building consistency." : "Room to develop.";
    $("score-fill").style.width = average + "%";
    $("score-progress").setAttribute("aria-valuenow", String(average));
    $("score-count").textContent = history.length + (history.length === 1 ? " assessment saved" : " assessments saved");
    const latest = history[history.length - 1];
    $("latest-date").textContent = latest ? "Latest · " + formatDate(latest.date) : "No assessment date";
  }

  function renderSkillCards(stats) {
    const grid = $("skill-grid");
    grid.replaceChildren();

    scoredTests.forEach(({ key, label, note, icon }) => {
      const value = toPercent(stats[key]);
      const card = document.createElement("article");
      card.className = "skill-card";

      const top = document.createElement("div");
      top.className = "skill-card-top";
      const symbol = document.createElement("span");
      symbol.className = "skill-icon";
      symbol.textContent = icon;
      const heading = document.createElement("span");
      heading.className = "skill-label";
      heading.textContent = label;
      top.append(symbol, heading);

      const score = document.createElement("div");
      score.className = "skill-score";
      score.textContent = value;

      const bar = document.createElement("div");
      bar.className = "skill-track";
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-label", label + " result");
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", "100");
      bar.setAttribute("aria-valuenow", String(value));
      const fill = document.createElement("span");
      fill.style.width = value + "%";
      bar.append(fill);

      const detail = document.createElement("p");
      detail.className = "skill-note";
      detail.textContent = note + " · " + Number(stats[key]) + "/10";
      card.append(top, score, bar, detail);
      grid.append(card);
    });
  }

  function renderMeasurements(stats) {
    const list = $("measurement-list");
    list.replaceChildren();

    Object.entries(measurementLabels).forEach(([key, label]) => {
      if (!(key in stats) || stats[key] === null || stats[key] === "") return;
      const row = document.createElement("div");
      row.className = "measurement-row";
      const name = document.createElement("span");
      name.textContent = label;
      const value = document.createElement("strong");
      const suffix = ["passing", "shooting", "defending", "possession", "goalkeeping"].includes(key)
        ? "/10" : (key === "sprint" || key === "dribbling" ? " sec" : "");
      value.textContent = String(stats[key]) + suffix;
      row.append(name, value);
      list.append(row);
    });

    if (!list.children.length) {
      const empty = document.createElement("p");
      empty.className = "chart-note";
      empty.textContent = "No additional measurements were included in this assessment.";
      list.append(empty);
    }
  }

  function renderProgress(history) {
    const chart = $("progress-chart");
    const axis = $("chart-axis");
    chart.replaceChildren();
    axis.replaceChildren();

    const requested = Number($("history-range").value) || 8;
    const data = history.slice(-requested);

    if (!data.length) {
      $("progress-note").textContent = "Complete your first assessment to start tracking progress.";
      $("trend-tag").textContent = "NO DATA";
      return;
    }

    const width = 620, height = 190, padX = 28, padY = 24;
    const points = data.map((item, index) => {
      const x = data.length === 1 ? width / 2 : padX + index * (width - 2 * padX) / (data.length - 1);
      const average = clamp(Number(item.average ?? getAverage(item.stats)));
      const y = height - padY - (average / 100) * (height - 2 * padY);
      return { x, y, item, average };
    });

    [25, 50, 75].forEach(value => {
      const y = height - padY - (value / 100) * (height - 2 * padY);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", padX);
      line.setAttribute("x2", width - padX);
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      line.setAttribute("class", "chart-gridline");
      chart.append(line);
    });

    if (points.length > 1) {
      const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      polyline.setAttribute("points", points.map(point => point.x + "," + point.y).join(" "));
      polyline.setAttribute("class", "chart-line");
      chart.append(polyline);
    }

    points.forEach(({ x, y, item, average }) => {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", x);
      circle.setAttribute("cy", y);
      circle.setAttribute("r", "5");
      circle.setAttribute("class", "chart-point");
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = formatDate(item.date) + ": " + average + "/100";
      circle.append(title);
      chart.append(circle);

      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", x);
      label.setAttribute("y", Math.max(14, y - 12));
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("class", "chart-value");
      label.textContent = average;
      chart.append(label);

      const axisLabel = document.createElement("span");
      axisLabel.textContent = formatDate(item.date);
      axis.append(axisLabel);
    });

    const first = points[0].average;
    const last = points[points.length - 1].average;
    const difference = last - first;
    $("trend-tag").textContent = points.length > 1
      ? (difference > 0 ? "+" : "") + difference + " pts"
      : "1 ASSESSMENT";
    $("progress-note").textContent = points.length === 1
      ? "One assessment saved. Complete another to compare results."
      : data.length + " recent assessments · average change " + (difference > 0 ? "+" : "") + difference + " points.";
  }

  const trainingPlans = {
    passing: {
      title: "Build passing accuracy",
      description: "Practice short passing against a wall or with a partner. Focus on your plant foot, body position, and a controlled first touch.",
      tasks: [
        ["Wall-pass technique", "10 minutes · controlled passes with both feet"],
        ["First-touch practice", "10 minutes · receive and redirect the ball"],
        ["Target passing", "10 minutes · aim for a clear target"]
      ]
    },
    shooting: {
      title: "Build shooting accuracy",
      description: "Use close-range target practice with controlled technique. Prioritize placement and balanced contact before adding power.",
      tasks: [
        ["Controlled striking", "10 minutes · focus on balanced contact"],
        ["Target practice", "10 minutes · aim for different goal areas"],
        ["Weak-foot touches", "5 minutes · comfortable, controlled repetitions"]
      ]
    },
    defending: {
      title: "Develop 1v1 defending",
      description: "Practice staying balanced, keeping a safe distance, and guiding an attacker away from space with a partner.",
      tasks: [
        ["Defensive footwork", "8 minutes · stay balanced and move laterally"],
        ["Containment practice", "10 minutes · work with a willing partner"],
        ["Recovery positioning", "8 minutes · reset shape after each repetition"]
      ]
    },
    possession: {
      title: "Improve ball retention",
      description: "Use simple keep-away games and close-control drills. Scan before receiving and practice protecting the ball while staying balanced.",
      tasks: [
        ["Close-control touches", "5 minutes · both feet"],
        ["Receive and turn", "10 minutes · check your shoulder first"],
        ["Keep-away practice", "10 minutes · use a partner if available"]
      ]
    },
    goalkeeping: {
      title: "Develop goalkeeping fundamentals",
      description: "Practice ready position, footwork, and controlled catching with a suitable partner or coach. Prioritize safe technique.",
      tasks: [
        ["Ready-position footwork", "5 minutes · balanced movement"],
        ["Controlled catching", "10 minutes · gentle, suitable throws"],
        ["Distribution technique", "8 minutes · accurate short passes"]
      ]
    }
  };

  function renderTraining(stats, analysis) {
    const weakest = scoredTests
      .map(item => ({ ...item, value: toPercent(stats[item.key]) }))
      .sort((a, b) => a.value - b.value)[0];
    const plan = trainingPlans[weakest.key];

    $("focus-title").textContent = plan.title;
    $("focus-description").textContent = plan.description;
    $("focus-score").textContent = weakest.value + "/100 on this assessment";
    $("coach-report").textContent = analysis || "Your AI coach report will appear here after you complete the assessment.";

    const savedTasks = safeParse(localStorage.getItem(TASK_KEY), {});
    const todayKey = new Date().toISOString().slice(0, 10);
    const taskState = savedTasks.date === todayKey && savedTasks.key === weakest.key ? savedTasks.done || [] : [];
    const taskList = $("task-list");
    taskList.replaceChildren();

    plan.tasks.forEach(([title, detail], index) => {
      const item = document.createElement("label");
      item.className = "task-item" + (taskState.includes(index) ? " completed" : "");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "task-check";
      checkbox.checked = taskState.includes(index);
      checkbox.addEventListener("change", () => {
        const current = safeParse(localStorage.getItem(TASK_KEY), {});
        const done = new Set(current.date === todayKey && current.key === weakest.key ? current.done || [] : []);
        checkbox.checked ? done.add(index) : done.delete(index);
        localStorage.setItem(TASK_KEY, JSON.stringify({
          date: todayKey, key: weakest.key, done: Array.from(done)
        }));
        item.classList.toggle("completed", checkbox.checked);
        status.textContent = checkbox.checked ? "DONE" : "TO DO";
        updateTaskProgress();
      });

      const copy = document.createElement("span");
      copy.className = "task-copy";
      const strong = document.createElement("strong");
      strong.textContent = title;
      const small = document.createElement("span");
      small.textContent = detail;
      copy.append(strong, small);

      const status = document.createElement("span");
      status.className = "task-status";
      status.textContent = checkbox.checked ? "DONE" : "TO DO";
      item.append(checkbox, copy, status);
      taskList.append(item);
    });

    updateTaskProgress();
  }

  function updateTaskProgress() {
    const boxes = Array.from(document.querySelectorAll(".task-check"));
    const done = boxes.filter(box => box.checked).length;
    $("task-progress").textContent = done + " of " + boxes.length + " complete";
  }

  function renderProfile() {
    const profile = safeParse(localStorage.getItem("masterballerProfile"), {});
    const user = window.masterballerUser;
    const metadata = user?.user_metadata || {};
    const name = profile.name || metadata.full_name || metadata.name ||
      (user?.email ? user.email.split("@")[0] : "Player");
    const position = profile.position || metadata.position || "Soccer development";
    $("player-name").textContent = name;
    $("player-position").textContent = position;
    $("player-avatar").textContent = String(name).trim().charAt(0).toUpperCase() || "P";
    $("welcome-message").textContent = "Welcome back, " + name + ". Let's build your next level.";
  }

  function setActiveNavigation() {
    const links = Array.from(document.querySelectorAll(".nav-link[href^='#']"));
    const sections = links.map(link => document.querySelector(link.getAttribute("href"))).filter(Boolean);
    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        links.forEach(link => link.classList.toggle("active", link.getAttribute("href") === "#" + entry.target.id));
      });
    }, { rootMargin: "-20% 0px -65% 0px" });
    sections.forEach(section => observer.observe(section));
  }

  const DATA_URL = "masterballer-data.json";
  let resourceData = null;

  function makeExternalLink(url, label, className = "resource-link") {
    const link = document.createElement("a");
    link.className = className;
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = label;
    return link;
  }

  function makeResourceCard(title, eyebrow, description) {
    const card = document.createElement("article");
    card.className = "resource-card";
    const tag = document.createElement("span");
    tag.className = "resource-eyebrow";
    tag.textContent = eyebrow || "MASTERBALLER RESOURCE";
    const heading = document.createElement("h3");
    heading.textContent = title;
    const copy = document.createElement("p");
    copy.textContent = description || "Visit the official source for current information.";
    card.append(tag, heading, copy);
    return card;
  }

  // Location-aware college and schedule search.
  let locationCoordinates = null;
  let locationLookupPromise = null;

  function getProgramCountry(program) {
    return program.country || (program.state ? "United States" : "Unknown");
  }

  function getCountriesInDatabase() {
    return [...new Set((resourceData?.collegePrograms || []).map(getProgramCountry))]
      .filter(country => country && country !== "Unknown")
      .sort((a, b) => a.localeCompare(b));
  }

  function makeSelect(id, labelText, options, selectedValue) {
    const wrap = document.createElement("label");
    wrap.className = "resource-filter-field";
    wrap.append(document.createTextNode(labelText));
    const select = document.createElement("select");
    select.id = id;
    options.forEach(item => {
      const option = document.createElement("option");
      option.value = item.value;
      option.textContent = item.label;
      select.append(option);
    });
    select.value = selectedValue;
    wrap.append(select);
    return wrap;
  }

  function saveFilterPreference(key, value) {
    const profile = safeParse(localStorage.getItem("masterballerProfile"), {});
    profile[key] = value;
    localStorage.setItem("masterballerProfile", JSON.stringify(profile));
  }

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const radians = value => value * Math.PI / 180;
    const dLat = radians(lat2 - lat1);
    const dLon = radians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2);
    return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async function resolvePlayerLocation(postalCode, countryCode, city, state) {
    const code = String(countryCode || "US").toUpperCase();
    const postal = String(postalCode || "").trim();
    const cityName = String(city || "").trim();
    const stateName = String(state || "").trim();
    if (locationLookupPromise) return locationLookupPromise;

    locationLookupPromise = (async () => {
      let coordinates = null;

      if (postal) {
        try {
          const response = await fetch(
            "https://api.zippopotam.us/" +
            encodeURIComponent(code.toLowerCase()) + "/" +
            encodeURIComponent(postal)
          );

          if (response.ok) {
            const data = await response.json();
            const place = data.places?.[0];
            if (place) {
              coordinates = {
                latitude: Number(place.latitude),
                longitude: Number(place.longitude)
              };
            }
          }
        } catch (error) {
          console.warn("Postal-code lookup unavailable; trying city lookup.", error);
        }
      }

      if (!coordinates && cityName) {
        const query = [cityName, stateName].filter(Boolean).join(",");
        const url =
          "https://geocoding-api.open-meteo.com/v1/search?name=" +
          encodeURIComponent(query) +
          "&count=10&language=en&format=json";

        const response = await fetch(url);
        if (!response.ok) throw new Error("Could not find that city or postal code.");

        const data = await response.json();
        const matches = (data.results || []).filter(item =>
          !item.country_code || item.country_code.toUpperCase() === code
        );
        const place = matches[0];

        if (place) {
          coordinates = {
            latitude: Number(place.latitude),
            longitude: Number(place.longitude)
          };
        }
      }

      if (!coordinates ||
          !Number.isFinite(coordinates.latitude) ||
          !Number.isFinite(coordinates.longitude)) {
        throw new Error("Could not verify that location. Check the country, city, state, or postal code.");
      }

      locationCoordinates = coordinates;
      return coordinates;
    })();

    try {
      return await locationLookupPromise;
    } finally {
      locationLookupPromise = null;
    }
  }

  async function ensureSavedLocationResolved() {
    if (locationCoordinates) return locationCoordinates;

    const saved = readSavedLocation();
    if (!saved.zip && !saved.city) return null;

    try {
      return await resolvePlayerLocation(
        saved.zip,
        saved.country,
        saved.city,
        saved.state
      );
    } catch (error) {
      console.warn("Could not resolve saved recruiting location:", error.message);
      return null;
    }
  }

  function getNearbyPrograms() {
    if (!locationCoordinates) return [];

    const saved = readSavedLocation();
    const radius = Math.max(1, Number(saved.radius) || 100);

    return (resourceData?.collegePrograms || [])
      .map(program => {
        const lat = Number(program.latitude);
        const lon = Number(program.longitude);

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

        return {
          ...program,
          distance: calculateDistance(
            locationCoordinates.latitude,
            locationCoordinates.longitude,
            lat,
            lon
          )
        };
      })
      .filter(program => program && program.distance <= radius)
      .sort((a, b) => a.distance - b.distance);
  }

  function getFilteredPrograms(modeId, countryId) {
    const mode = $(modeId)?.value || "local";
    const country = $(countryId)?.value || "all";

    let programs;

    if (mode === "local") {
      programs = getNearbyPrograms();
    } else {
      programs = (resourceData?.collegePrograms || []).map(program => ({
        ...program,
        distance: null
      }));
    }

    if (country !== "all") {
      programs = programs.filter(program => getProgramCountry(program) === country);
    }

    return programs;
  }

  function setupGlobalResourceFilters() {
    const profile = safeParse(localStorage.getItem("masterballerProfile"), {});
    const countryOptions = [
      { value: "all", label: "All countries" },
      ...getCountriesInDatabase().map(country => ({
        value: country,
        label: country
      }))
    ];

    const recruitingTarget = $("recruiting-results");

    if (recruitingTarget && !$("program-global-filters")) {
      const wrapper = document.createElement("div");
      wrapper.id = "program-global-filters";
      wrapper.className = "directory-toolbar";

      wrapper.append(
        makeSelect("program-search-mode", "Program search", [
          { value: "local", label: "Near my saved location" },
          { value: "global", label: "Worldwide" }
        ], profile.programSearchMode || "local"),

        makeSelect("program-country-filter", "Country", countryOptions,
          profile.programCountryFilter || "all")
      );

      recruitingTarget.parentNode.insertBefore(wrapper, recruitingTarget);

      $("program-search-mode").addEventListener("change", () => {
        saveFilterPreference("programSearchMode", $("program-search-mode").value);
        renderRecruiting();
      });

      $("program-country-filter").addEventListener("change", () => {
        saveFilterPreference("programCountryFilter", $("program-country-filter").value);
        renderRecruiting();
      });
    }

    const gamesTarget = $("games-results");

    if (gamesTarget && !$("games-global-filters")) {
      const wrapper = document.createElement("div");
      wrapper.id = "games-global-filters";
      wrapper.className = "directory-toolbar";

      wrapper.append(
        makeSelect("games-search-mode", "Schedule search", [
          { value: "local", label: "Near my saved location" },
          { value: "global", label: "Worldwide" }
        ], profile.gamesSearchMode || "local"),

        makeSelect("games-country-filter", "Country", countryOptions,
          profile.gamesCountryFilter || "all")
      );

      gamesTarget.parentNode.insertBefore(wrapper, gamesTarget);

      $("games-search-mode").addEventListener("change", () => {
        saveFilterPreference("gamesSearchMode", $("games-search-mode").value);
        renderCollegeSchedules();
      });

      $("games-country-filter").addEventListener("change", () => {
        saveFilterPreference("gamesCountryFilter", $("games-country-filter").value);
        renderCollegeSchedules();
      });
    }
  }

  function renderRecruiting() {
    const target = $("recruiting-results");
    if (!target || !resourceData) return;

    target.replaceChildren();

    const gender = $("recruiting-gender")?.value || "both";
    let count = 0;
    const programs = getFilteredPrograms(
      "program-search-mode",
      "program-country-filter"
    );

    programs.forEach(program => {
      (program.teams || [])
        .filter(team => gender === "both" || team.gender === gender)
        .forEach(team => {
          count++;

          const card = makeResourceCard(
            program.school + " · " +
              (team.gender === "men" ? "Men's Soccer" : "Women's Soccer"),
            program.division + " · " + program.conference,
            [program.city, program.state, program.country].filter(Boolean).join(", ") +
              (Number.isFinite(program.distance)
                ? " · " + Math.round(program.distance) + " miles away"
                : "") +
              " · Head coach: " +
              (team.headCoach || "See official staff page")
          );

          const contacts = document.createElement("div");
          contacts.className = "contact-list";

          (team.staff || []).forEach(person => {
            const row = document.createElement("div");
            row.className = "contact-row";

            const personName = document.createElement("strong");
            personName.textContent =
              person.name + (person.title ? " · " + person.title : "");
            row.append(personName);

            const details = [];

            if (person.email) {
              details.push(makeExternalLink(
                "mailto:" + person.email,
                person.email,
                "contact-link"
              ));
            }

            if (person.phone) {
              details.push(makeExternalLink(
                "tel:" + person.phone.replace(/[^0-9+]/g, ""),
                person.phone,
                "contact-link"
              ));
            }

            details.forEach(link => row.append(link));
            contacts.append(row);
          });

          card.append(contacts);

          const actions = document.createElement("div");
          actions.className = "resource-actions";

          if (team.staffDirectoryUrl) {
            actions.append(makeExternalLink(
              team.staffDirectoryUrl,
              "Official coaching staff ↗"
            ));
          }

          if (team.scheduleUrl) {
            actions.append(makeExternalLink(
              team.scheduleUrl,
              "Team schedule ↗"
            ));
          }

          card.append(actions);
          target.append(card);
        });
    });

    if (!count) {
      const empty = document.createElement("p");
      empty.className = "directory-loading";
      empty.textContent = $("program-search-mode")?.value === "local"
        ? "No programs with verified coordinates are within your saved search radius. Try expanding the radius or switching to Worldwide."
        : "No programs are available for this filter in the current dataset.";
      target.append(empty);
    }
  }

  function renderCollegeSchedules() {
    const target = $("games-results");
    if (!target || !resourceData) return;

    target.replaceChildren();

    const gender = $("games-gender")?.value || "both";
    let count = 0;
    const programs = getFilteredPrograms(
      "games-search-mode",
      "games-country-filter"
    );

    programs.forEach(program => {
      (program.teams || [])
        .filter(team => gender === "both" || team.gender === gender)
        .forEach(team => {
          count++;

          const card = makeResourceCard(
            program.school + " · " +
              (team.gender === "men" ? "Men's" : "Women's"),
            "OFFICIAL COLLEGE SCHEDULE",
            "Open the university schedule for published fixtures, results, venues, and ticket details." +
              (Number.isFinite(program.distance)
                ? " Approx. " + Math.round(program.distance) +
                  " miles from your saved location."
                : "")
          );

          if (team.scheduleUrl) {
            card.append(makeExternalLink(
              team.scheduleUrl,
              "View official schedule ↗"
            ));
          }

          target.append(card);
        });
    });

    if (!count) {
      const empty = document.createElement("p");
      empty.className = "directory-loading";
      empty.textContent = $("games-search-mode")?.value === "local"
        ? "No schedules with verified college locations are within your saved radius. Expand the radius or switch to Worldwide."
        : "No official schedules are available for this filter yet.";
      target.append(empty);
    }
  }

  function renderClubs() {
    const target = $("club-results");
    if (!target || !resourceData) return;

    target.replaceChildren();

    const selectedLeague = $("club-league")?.value || "all";
    const clubs = (resourceData.popularClubs || [])
      .filter(club => selectedLeague === "all" || club.league === selectedLeague);

    clubs.forEach(club => {
      const card = makeResourceCard(
        club.name,
        club.league + " · " + club.country,
        "Official club website and club news."
      );

      if (club.officialUrl) {
        card.append(makeExternalLink(
          club.officialUrl,
          "Official club website ↗"
        ));
      }

      target.append(card);
    });

    if (!clubs.length) {
      const empty = document.createElement("p");
      empty.className = "directory-loading";
      empty.textContent = "No clubs match this competition filter.";
      target.append(empty);
    }
  }

  function scholarshipCategory(item) {
    const status = String(
      item.status || item.status_as_of_2026_11_21 || ""
    ).toLowerCase();

    if (status.includes("closed")) return "closed";
    if (status.includes("open")) return "open";
    if (status.includes("directory")) return "directory";
    return "upcoming";
  }

  function renderScholarships() {
    const target = $("scholarship-results");
    if (!target || !resourceData) return;

    target.replaceChildren();

    const filter = $("scholarship-status")?.value || "all";
    const items = resourceData.scholarshipOpportunities || [];
    const savedLocation = readSavedLocation();

    const visible = items.filter(item => {
      if (filter !== "all" && scholarshipCategory(item) !== filter) {
        return false;
      }

      const states = Array.isArray(item.eligibleStates)
        ? item.eligibleStates
        : [];

      if (states.length && savedLocation.state &&
          !states.some(state =>
            String(state).toUpperCase() === savedLocation.state.toUpperCase()
          )) {
        return false;
      }

      const countries = Array.isArray(item.eligibleCountries)
        ? item.eligibleCountries
        : [];

      const selectedCountryLabel =
        $("profile-country")?.selectedOptions?.[0]?.textContent ||
        savedLocation.country;

      const countryAliases = [
        String(savedLocation.country).toUpperCase(),
        String(selectedCountryLabel).toUpperCase()
      ];

      if (savedLocation.country === "US") {
        countryAliases.push("USA", "UNITED STATES");
      }

      if (savedLocation.country === "GB") {
        countryAliases.push("UK", "UNITED KINGDOM");
      }

      if (countries.length && !countries.some(country =>
        countryAliases.includes(String(country).toUpperCase())
      )) {
        return false;
      }

      return true;
    });

    visible.forEach(item => {
      const status =
        item.status ||
        item.status_as_of_2026_11_21 ||
        "Verify current status";

      const card = makeResourceCard(
        item.name,
        status,
        item.amount || "Award amount varies"
      );

      const meta = document.createElement("ul");
      meta.className = "resource-meta";

      if (item.deadline) {
        const li = document.createElement("li");
        li.textContent = "Deadline: " + item.deadline;
        meta.append(li);
      }

      if (item.locationRestriction) {
        const li = document.createElement("li");
        li.textContent = "Location restriction: " + item.locationRestriction;
        meta.append(li);
      }

      (item.eligibility || []).slice(0, 4).forEach(rule => {
        const li = document.createElement("li");
        li.textContent = rule;
        meta.append(li);
      });

      card.append(meta);

      if (item.applicationUrl) {
        card.append(makeExternalLink(
          item.applicationUrl,
          "View opportunity ↗"
        ));
      }

      target.append(card);
    });

    const general = [
      {
        title: "NCAA scholarships & financial aid",
        eyebrow: "OFFICIAL NCAA GUIDANCE",
        description: "Learn how Division I, II, and III athletic aid works. Soccer awards can be partial, and coaches—not the NCAA—award school-based athletic scholarships.",
        url: "https://www.ncaa.org/student-athletes/scholarships-and-financial-aid/"
      },
      {
        title: "Soccer scholarship search",
        eyebrow: "SCHOLARSHIP DIRECTORY",
        description: "Browse soccer-related awards and check each provider's eligibility rules and deadlines.",
        url: "https://www.scholarships.com/financial-aid/college-scholarships/sports-scholarships/soccer-scholarships"
      },
      {
        title: "College soccer recruiting & athletic aid",
        eyebrow: "RECRUITING RESOURCE",
        description: "Explore college soccer programs and learn how to contact coaches about roster and scholarship opportunities.",
        url: "https://www.ncsasports.org/athletic-scholarships"
      }
    ];

    general.forEach(item => {
      const card = makeResourceCard(
        item.title,
        item.eyebrow,
        item.description
      );
      card.append(makeExternalLink(item.url, "Explore resource ↗"));
      target.append(card);
    });

    if (!visible.length && filter !== "all") {
      const empty = document.createElement("p");
      empty.className = "directory-loading";
      empty.textContent = "No individual awards match this filter in the starter dataset. Try the directories and NCAA guidance below.";
      target.prepend(empty);
    }
  }

  function readSavedLocation() {
    const local = safeParse(
      localStorage.getItem("masterballerProfile"),
      {}
    );
    const metadata = window.masterballerUser?.user_metadata || {};

    return {
      country: local.recruitingCountry || metadata.recruiting_country || "US",
      city: local.recruitingCity || metadata.recruiting_city || "",
      state: local.recruitingState || metadata.recruiting_state || "",
      zip: local.recruitingZip || metadata.recruiting_zip || "",
      radius: String(
        local.recruitingRadius || metadata.recruiting_radius || 100
      )
    };
  }

  function populateLocation() {
    const saved = readSavedLocation();

    if ($("profile-country")) $("profile-country").value = saved.country;
    if ($("profile-city")) $("profile-city").value = saved.city;
    if ($("profile-state")) $("profile-state").value = saved.state;
    if ($("profile-zip")) $("profile-zip").value = saved.zip;
    if ($("search-radius")) $("search-radius").value = saved.radius;
  }

  function setupLocationForm() {
    const form = $("location-form");
    if (!form || form.dataset.masterballerBound === "true") return;

    form.dataset.masterballerBound = "true";
    populateLocation();

    form.addEventListener("submit", async event => {
      event.preventDefault();

      const country = $("profile-country")?.value || "US";
      const city = $("profile-city")?.value.trim() || "";
      const state = $("profile-state")?.value.trim() || "";
      const zip = $("profile-zip")?.value.trim() || "";
      const radius = Math.max(
        1,
        Number($("search-radius")?.value) || 100
      );
      const status = $("location-status");

      if (!zip && !city) {
        if (status) {
          status.textContent = "Enter a city or postal code.";
          status.classList.add("is-error");
        }
        return;
      }

      if (country === "US" && zip && !/^\d{5}$/.test(zip)) {
        if (status) {
          status.textContent = "Enter a valid 5-digit U.S. ZIP code, or leave it blank and enter your city.";
          status.classList.add("is-error");
        }
        return;
      }

      const profile = safeParse(
        localStorage.getItem("masterballerProfile"),
        {}
      );

      Object.assign(profile, {
        recruitingCountry: country,
        recruitingCity: city,
        recruitingState: state,
        recruitingZip: zip,
        recruitingRadius: radius,
        programSearchMode: profile.programSearchMode || "local",
        gamesSearchMode: profile.gamesSearchMode || "local"
      });

      localStorage.setItem(
        "masterballerProfile",
        JSON.stringify(profile)
      );

      locationCoordinates = null;

      if (status) {
        status.classList.remove("is-error");
        status.textContent = "Location saved. Updating nearby programs…";
      }

      try {
        await resolvePlayerLocation(zip, country, city, state);

        if (window.masterballerUser &&
            typeof supabaseClient !== "undefined") {
          const { error } = await supabaseClient.auth.updateUser({
            data: {
              recruiting_country: country,
              recruiting_city: city,
              recruiting_state: state,
              recruiting_zip: zip,
              recruiting_radius: radius
            }
          });

          if (error) throw error;
        }

        renderRecruiting();
        renderCollegeSchedules();
        renderScholarships();

        if (status) {
          status.textContent = "Recruiting location saved. Nearby programs and schedules have been refreshed.";
        }
      } catch (error) {
        console.error("Could not update recruiting location:", error);

        renderRecruiting();
        renderCollegeSchedules();

        if (status) {
          status.textContent = "Location saved, but it could not be verified or synced. Check the location details and try again.";
          status.classList.add("is-error");
        }
      }
    });
  }

  async function initResourceHub() {
    setupLocationForm();

    try {
      const response = await fetch(DATA_URL, { cache: "no-cache" });

      if (!response.ok) {
        throw new Error(
          "Could not load MasterBaller data (" + response.status + ")"
        );
      }

      resourceData = await response.json();

      setupGlobalResourceFilters();
      await ensureSavedLocationResolved();

      renderRecruiting();
      renderCollegeSchedules();
      renderClubs();
      renderScholarships();

      $("recruiting-gender")?.addEventListener("change", renderRecruiting);
      $("games-gender")?.addEventListener("change", renderCollegeSchedules);
      $("club-league")?.addEventListener("change", renderClubs);
      $("scholarship-status")?.addEventListener("change", renderScholarships);

      const leagueSelect = $("club-league");

      [
        ...new Set(
          (resourceData.popularClubs || []).map(club => club.league)
        )
      ].sort().forEach(league => {
        const option = document.createElement("option");
        option.value = league;
        option.textContent = league;
        leagueSelect?.append(option);
      });
    } catch (error) {
      console.error("MasterBaller resource data failed to load:", error);

      [
        "recruiting-results",
        "games-results",
        "club-results",
        "scholarship-results"
      ].forEach(id => {
        const target = $(id);
        if (target) {
          target.textContent = "Resource data could not be loaded. Make sure masterballer-data.json is in the same folder as dashboard.html.";
        }
      });
    }
  }

  async function init() {
    if (window.__masterballerAuthReady) {
      const authenticated = await window.__masterballerAuthReady;
      if (!authenticated) return;
    }

    const current = saveCurrentAssessment();
    const history = readHistory();
    const latest = history[history.length - 1];
    const stats = current?.stats || latest?.stats;

    renderProfile();
    $("year").textContent = new Date().getFullYear();

    if (!stats ||
        !scoredTests.every(({ key }) =>
          Number.isFinite(Number(stats[key]))
        )) {
      $("empty-state").hidden = false;
      $("dashboard-content").hidden = false;

      [
        "assessment-overview",
        "performance",
        "training-pathway-grid",
        "measurements"
      ].forEach(id => {
        const section = $(id);
        if (section) section.hidden = true;
      });

      await initResourceHub();
      setActiveNavigation();
      return;
    }

    $("empty-state").hidden = true;
    $("dashboard-content").hidden = false;

    [
      "assessment-overview",
      "performance",
      "training-pathway-grid",
      "measurements"
    ].forEach(id => {
      const section = $(id);
      if (section) section.hidden = false;
    });

    renderScore(stats, history);
    renderSkillCards(stats);
    renderMeasurements(stats);
    renderProgress(history);
    renderTraining(stats, current?.analysis || latest?.analysis || "");

    await initResourceHub();
    setActiveNavigation();

    $("history-range").addEventListener("change", () => {
      renderProgress(readHistory());
    });
  }

  const menuToggle = $("menu-toggle");

  if (menuToggle) {
    menuToggle.addEventListener("click", () => {
      const sidebar = $("sidebar");
      const open = sidebar.classList.toggle("is-open");
      menuToggle.setAttribute("aria-expanded", String(open));
    });
  }

  document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", () => {
      $("sidebar").classList.remove("is-open");
      menuToggle?.setAttribute("aria-expanded", "false");
    });
  });

  init().catch(error => {
    console.error("MasterBaller dashboard failed to initialize:", error);
    $("empty-state").hidden = false;
    $("dashboard-content").hidden = true;
  });
})();
