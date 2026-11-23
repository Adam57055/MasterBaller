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


  // ------------------------------------------------------------
  // COLLEGE RECRUITING + UNIVERSITY CLUB DIRECTORY
  // Data source: /masterballer-data.json
  // ------------------------------------------------------------

  const DIRECTORY_URL = "/masterballer-data.json";
  const PROFILE_KEY = "masterballerProfile";
  let directoryData = null;
  let playerLocation = null;

  function escapeText(value) {
    return String(value ?? "");
  }

  function makeElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function makeLink(url, label, className = "resource-link") {
    const link = makeElement("a", className, label);
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    return link;
  }

  const COUNTRY_CODES = {
    "United States": "US", "Canada": "CA", "United Kingdom": "GB", "Ireland": "IE",
    "Australia": "AU", "New Zealand": "NZ", "India": "IN", "Germany": "DE",
    "France": "FR", "Spain": "ES", "Italy": "IT", "Netherlands": "NL",
    "Portugal": "PT", "Brazil": "BR", "Mexico": "MX", "Japan": "JP",
    "Sweden": "SE", "Norway": "NO", "Denmark": "DK", "Belgium": "BE",
    "Switzerland": "CH", "South Africa": "ZA", "Ghana": "GH", "Nigeria": "NG",
    "Argentina": "AR", "Chile": "CL", "Colombia": "CO", "South Korea": "KR",
    "Poland": "PL", "Austria": "AT"
  };

  function countryCodeForRecord(country, explicitCode) {
    if (explicitCode) return String(explicitCode).toUpperCase();
    return COUNTRY_CODES[country] || "";
  }

  function readPlayerLocation() {
    const profile = safeParse(localStorage.getItem(PROFILE_KEY), {});
    return {
      country: profile.country || "US",
      city: profile.city || profile.recruitingCity || "",
      state: profile.state || profile.recruitingState || "",
      zip: profile.zip || profile.recruitingZip || "",
      radius: Number(profile.radius || profile.recruitingRadius) || 100,
      latitude: profile.latitude !== null && profile.latitude !== undefined && profile.latitude !== "" && Number.isFinite(Number(profile.latitude)) ? Number(profile.latitude) : null,
      longitude: profile.longitude !== null && profile.longitude !== undefined && profile.longitude !== "" && Number.isFinite(Number(profile.longitude)) ? Number(profile.longitude) : null
    };
  }

  function milesBetween(lat1, lon1, lat2, lon2) {
    const toRadians = value => value * Math.PI / 180;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
    return 3958.7613 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async function lookupPostalLocation(zip, country) {
    if (!zip || !country || country === "ALL") return null;
    try {
      const response = await fetch("https://api.zippopotam.us/" +
        encodeURIComponent(country.toLowerCase()) + "/" + encodeURIComponent(zip.trim()));
      if (!response.ok) return null;
      const result = await response.json();
      const place = result.places && result.places[0];
      if (!place) return null;
      return {
        latitude: Number(place.latitude),
        longitude: Number(place.longitude),
        city: place["place name"] || "",
        state: place.state || ""
      };
    } catch (error) {
      console.warn("Could not look up postal code:", error);
      return null;
    }
  }

  function getDistanceForProgram(program) {
    if (!playerLocation || playerLocation.latitude === null || playerLocation.longitude === null) return null;
    if (program.latitude === null || program.latitude === undefined || program.latitude === "" ||
        program.longitude === null || program.longitude === undefined || program.longitude === "" ||
        !Number.isFinite(Number(program.latitude)) || !Number.isFinite(Number(program.longitude))) return null;
    return milesBetween(playerLocation.latitude, playerLocation.longitude,
      Number(program.latitude), Number(program.longitude));
  }

  function filterByPlayerLocation(records, getCountry, getDistance) {
    if (!playerLocation || playerLocation.country === "ALL") return records.slice();
    const countryMatches = records.filter(record => {
      const country = getCountry(record);
      return Boolean(country) && country.toUpperCase() === playerLocation.country.toUpperCase();
    });
    if (playerLocation.latitude === null || playerLocation.longitude === null) return countryMatches;
    return countryMatches.filter(record => {
      const distance = getDistance(record);
      // Keep records without coordinates visible, but clearly label their distance as unavailable.
      return distance === null || distance <= playerLocation.radius;
    });
  }

  function createResourceCard(title, subtitle, description, links, statusText) {
    const card = makeElement("article", "resource-card");
    const heading = makeElement("h4", "resource-card-title", title);
    card.append(heading);
    if (subtitle) card.append(makeElement("p", "resource-card-meta", subtitle));
    if (description) card.append(makeElement("p", "resource-card-description", description));
    if (statusText) card.append(makeElement("p", "resource-card-meta", statusText));
    if (links && links.length) {
      const linkRow = makeElement("div", "resource-card-links");
      links.forEach(link => {
        if (link && link.url) linkRow.append(makeLink(link.url, link.label));
      });
      card.append(linkRow);
    }
    return card;
  }

  function renderRecruitingPrograms() {
    const container = $("recruiting-results");
    if (!container || !directoryData) return;
    container.replaceChildren();

    const gender = $("recruiting-gender")?.value || "both";
    const programs = filterByPlayerLocation(
      directoryData.collegePrograms || [],
      program => countryCodeForRecord(program.country, program.countryCode),
      getDistanceForProgram
    ).slice().sort((a, b) => {
      const da = getDistanceForProgram(a);
      const db = getDistanceForProgram(b);
      if (da === null && db === null) return String(a.school).localeCompare(String(b.school));
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });

    if (!programs.length) {
      container.append(makeElement("p", "directory-empty", "No official programs in this part of the directory match the selected country and radius yet."));
      return;
    }

    programs.forEach(program => {
      const selectedTeams = (program.teams || []).filter(team => gender === "both" || team.gender === gender);
      if (!selectedTeams.length) return;
      const distance = getDistanceForProgram(program);
      const subtitleParts = [program.city, program.state, program.country, program.division, program.conference].filter(Boolean);
      if (distance !== null) subtitleParts.push(Math.round(distance) + " miles away");
      const links = [];
      selectedTeams.forEach(team => {
        if (team.staffDirectoryUrl) links.push({ url: team.staffDirectoryUrl, label: (team.gender === "women" ? "Women's" : "Men's") + " coaches" });
        if (team.scheduleUrl) links.push({ url: team.scheduleUrl, label: (team.gender === "women" ? "Women's" : "Men's") + " schedule" });
      });
      const staffNames = selectedTeams.map(team => {
        const head = team.headCoach ? "Head coach: " + team.headCoach : "Head coach not listed";
        return (team.gender === "women" ? "Women" : "Men") + " — " + head;
      }).join(" · ");
      container.append(createResourceCard(program.school, subtitleParts.join(" · "), staffNames, links,
        program.verificationStatus === "verified" ? "Official program record verified" : "Starter record — confirm current staff and team details on the official site"));
    });
  }

  function ensureUniversityClubSection() {
    const hub = $("recruiting-hub");
    if (!hub || $("university-club-results")) return;
    const section = makeElement("div", "university-club-directory");
    section.style.marginTop = "24px";
    const heading = makeElement("div", "section-heading");
    const headingCopy = makeElement("div");
    headingCopy.append(makeElement("h3", "", "University soccer clubs"));
    headingCopy.append(makeElement("p", "", "Student-run competitive, recreational, and social soccer clubs."));
    heading.append(headingCopy);
    section.append(heading);

    const toolbar = makeElement("div", "directory-toolbar");
    const typeLabel = makeElement("label", "location-field", "Club type");
    typeLabel.htmlFor = "university-club-type";
    const typeSelect = makeElement("select");
    typeSelect.id = "university-club-type";
    typeSelect.innerHTML = '<option value="all">All types</option><option value="competitive">Competitive</option><option value="recreational">Recreational</option><option value="futsal">Futsal</option><option value="social">Social</option>';
    typeLabel.append(typeSelect);
    const genderLabel = makeElement("label", "location-field", "Team");
    genderLabel.htmlFor = "university-club-gender";
    const genderSelect = makeElement("select");
    genderSelect.id = "university-club-gender";
    genderSelect.innerHTML = '<option value="all">All teams</option><option value="men">Men</option><option value="women">Women</option><option value="coed">Co-ed</option><option value="open">Open</option>';
    genderLabel.append(genderSelect);
    toolbar.append(typeLabel, genderLabel);
    section.append(toolbar);
    section.append(makeElement("div", "resource-grid", ""));
    section.lastElementChild.id = "university-club-results";
    section.append(makeElement("p", "resource-footnote", "Club listings are added only when a current university or club source can be verified. Contact clubs directly to confirm membership eligibility and tryouts."));

    const games = $("games-results");
    if (games && games.parentElement) games.parentElement.insertAdjacentElement("afterend", section);
    else hub.append(section);
    typeSelect.addEventListener("change", renderUniversityClubs);
    genderSelect.addEventListener("change", renderUniversityClubs);
  }

  function renderUniversityClubs() {
    const container = $("university-club-results");
    if (!container || !directoryData) return;
    container.replaceChildren();
    const type = $("university-club-type")?.value || "all";
    const gender = $("university-club-gender")?.value || "all";
    const clubs = filterByPlayerLocation(
      directoryData.universityClubs || [],
      club => countryCodeForRecord(club.country, club.countryCode),
      club => {
        if (playerLocation?.latitude == null || playerLocation?.longitude == null || club.latitude == null || club.longitude == null) return null;
        return milesBetween(playerLocation.latitude, playerLocation.longitude, Number(club.latitude), Number(club.longitude));
      }
    ).filter(club => (type === "all" || club.clubType === type) && (gender === "all" || club.gender === gender));

    if (!clubs.length) {
      container.append(makeElement("p", "directory-empty", "No verified university club records match these filters yet. Use the source directories below to discover clubs; individual listings will appear here as they are verified."));
      return;

         }

    clubs.forEach(club => {
      const distance = playerLocation?.latitude == null || club.latitude == null ? null :
        milesBetween(playerLocation.latitude, playerLocation.longitude, Number(club.latitude), Number(club.longitude));
      const subtitle = [club.school, club.city, club.state, club.country, club.clubType, club.gender].filter(Boolean).join(" · ");
      const links = [];
      if (club.officialUrl) links.push({ url: club.officialUrl, label: "Club page" });
      if (club.contactUrl) links.push({ url: club.contactUrl, label: "Contact" });
      const extra = distance === null ? "Distance unavailable" : Math.round(distance) + " miles away";
      container.append(createResourceCard(club.clubName || club.school + " Soccer Club", subtitle,
        club.leagueOrAssociation || "University-affiliated student club", links,
        (club.verificationStatus || "needs_review") + " · " + extra));
    });
  }

  function renderClubDirectory() {
    const container = $("club-results");
    const select = $("club-league");
    if (!container || !directoryData) return;
    const clubs = directoryData.popularClubs || [];
    if (select && select.options.length <= 1) {
      [...new Set(clubs.map(club => club.league).filter(Boolean))].sort().forEach(league => {
        const option = makeElement("option", "", league);
        option.value = league;
        select.append(option);
      });
    }
    const league = select?.value || "all";
    container.replaceChildren();
    clubs.filter(club => league === "all" || club.league === league).forEach(club => {
      container.append(createResourceCard(club.name, [club.league, club.country].filter(Boolean).join(" · "), "Official club website", [
        { url: club.officialUrl, label: "Official website" }
      ]));
    });
  }

  function scholarshipStatus(item) {
    const value = String(item.status || "").toLowerCase();
    if (value.includes("directory")) return "directory";
    if (value.includes("closed")) return "closed";
    if (value.includes("upcoming")) return "upcoming";
    if (value.includes("open")) return "open";
    if (item.deadline) {
      const deadline = new Date(item.deadline);
      if (!Number.isNaN(deadline.getTime()) && deadline < new Date()) return "closed";
    }
    return "all";
  }

  function renderScholarships() {
    const container = $("scholarship-results");
    const select = $("scholarship-status");
    if (!container || !directoryData) return;
    const filter = select?.value || "all";
    container.replaceChildren();
    (directoryData.scholarshipOpportunities || []).filter(item => {
      const status = scholarshipStatus(item);
      return filter === "all" || status === filter;
    }).forEach(item => {
      const details = [item.amount, item.scope, item.deadline ? "Deadline: " + item.deadline : ""].filter(Boolean).join(" · ");
      const eligibility = Array.isArray(item.eligibility) ? item.eligibility.join("; ") : "Check provider requirements.";
      container.append(createResourceCard(item.name, details, eligibility, [
        { url: item.applicationUrl, label: item.status === "Directory" ? "Open directory" : "Official details / application" }
      ], item.status || "Check current status"));
    });
  }

  function renderDirectorySources() {
    const hub = $("recruiting-hub");
    if (!hub || $("directory-source-results") || !directoryData) return;
    const section = makeElement("div", "directory-source-section");
    section.style.marginTop = "24px";
    const heading = makeElement("div", "section-heading");
    const copy = makeElement("div");
    copy.append(makeElement("h3", "", "Explore more university directories"));
    copy.append(makeElement("p", "", "These are discovery sources, not confirmation that every school offers soccer."));
    heading.append(copy);
    section.append(heading);
    const results = makeElement("div", "resource-grid");
    results.id = "directory-source-results";
    (directoryData.directorySources || []).forEach(source => {
      results.append(createResourceCard(source.name, source.country + " · " + source.category,
        source.use, [{ url: source.url, label: "Open source" }], source.verificationStatus));
    });
    section.append(results);
    hub.append(section);
  }

  async function loadDirectoryData() {
    try {
      const response = await fetch(DIRECTORY_URL, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load " + DIRECTORY_URL + " (HTTP " + response.status + ")");
      directoryData = await response.json();
      if (!Array.isArray(directoryData.collegePrograms)) directoryData.collegePrograms = [];
      if (!Array.isArray(directoryData.universityClubs)) directoryData.universityClubs = [];
      if (!Array.isArray(directoryData.popularClubs)) directoryData.popularClubs = [];
      if (!Array.isArray(directoryData.scholarshipOpportunities)) directoryData.scholarshipOpportunities = [];
      if (!Array.isArray(directoryData.directorySources)) directoryData.directorySources = [];
      return true;
    } catch (error) {
      console.error("MasterBaller directory data failed to load:", error);
      ["recruiting-results", "games-results", "club-results", "scholarship-results"].forEach(id => {
        const node = $(id);
        if (node) node.textContent = "Directory data could not be loaded. Check that masterballer-data.json is in your site's public/root folder.";
      });
      return false;
    }
  }

  async function saveLocation(event) {
    event.preventDefault();
    const status = $("location-status");
    const country = $("profile-country")?.value || "US";
    const city = $("profile-city")?.value.trim() || "";
    const state = $("profile-state")?.value.trim() || "";
    const zip = $("profile-zip")?.value.trim() || "";
    const radius = Number($("search-radius")?.value) || 100;
    const button = $("save-location");
    if (status) status.textContent = "Saving location…";
    if (button) button.disabled = true;

    let coordinates = null;
    if (zip && country !== "ALL") coordinates = await lookupPostalLocation(zip, country);
    const profile = safeParse(localStorage.getItem(PROFILE_KEY), {});
    const nextProfile = {
      ...profile,
      country, city, state, zip, radius,
      recruitingCity: city,
      recruitingState: state,
      recruitingZip: zip,
      recruitingRadius: radius
    };
    if (coordinates) {
      nextProfile.latitude = coordinates.latitude;
      nextProfile.longitude = coordinates.longitude;
      nextProfile.city = city || coordinates.city;
      nextProfile.state = state || coordinates.state;
    } else {
      delete nextProfile.latitude;
      delete nextProfile.longitude;
    }
    localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
    playerLocation = readPlayerLocation();
    if (status) {
      if (zip && !coordinates) status.textContent = "Location saved, but that postal code could not be verified. Results are filtered by country; radius filtering needs a valid postal code.";
      else status.textContent = "Location saved. Recruiting results have been refreshed.";
    }
    if (button) button.disabled = false;
    refreshDirectoryViews();
  }

  function populateLocationForm() {
    playerLocation = readPlayerLocation();
    const countrySelect = $("profile-country");
    if (countrySelect && !Array.from(countrySelect.options).some(option => option.value === "ALL")) {
      const worldwide = makeElement("option", "", "Worldwide");
      worldwide.value = "ALL";
      countrySelect.insertBefore(worldwide, countrySelect.firstChild);
    }
    const fields = {
      "profile-country": playerLocation.country,
      "profile-city": playerLocation.city,
      "profile-state": playerLocation.state,
      "profile-zip": playerLocation.zip,
      "search-radius": String(playerLocation.radius)
    };
    Object.entries(fields).forEach(([id, value]) => {
      const field = $(id);
      if (field) field.value = value;
    });
    const status = $("location-status");
    if (status && playerLocation.zip) status.textContent = "Saved location loaded. Change it and select Save location to refresh results.";
  }

  function refreshDirectoryViews() {
    renderRecruitingPrograms();
    renderRecruitingGames();
    renderUniversityClubs();
    renderClubDirectory();
    renderScholarships();
  }

  async function initRecruitingDirectory() {
    populateLocationForm();
    const form = $("location-form");
    if (form) form.addEventListener("submit", saveLocation);
    $("recruiting-gender")?.addEventListener("change", renderRecruitingPrograms);
    $("games-gender")?.addEventListener("change", renderRecruitingGames);
    $("club-league")?.addEventListener("change", renderClubDirectory);
    $("scholarship-status")?.addEventListener("change", renderScholarships);
    ensureUniversityClubSection();
    const loaded = await loadDirectoryData();
    if (!loaded) return;
    renderDirectorySources();
    refreshDirectoryViews();
  }

  function renderRecruitingGames() {
    const container = $("games-results");
    if (!container || !directoryData) return;
    container.replaceChildren();
    const gender = $("games-gender")?.value || "both";
    const programs = filterByPlayerLocation(
      directoryData.collegePrograms || [],
      program => countryCodeForRecord(program.country, program.countryCode),
      getDistanceForProgram
    );
    let count = 0;
    programs.forEach(program => {
      (program.teams || []).filter(team => gender === "both" || team.gender === gender).forEach(team => {
        if (!team.scheduleUrl) return;
        count++;
        const distance = getDistanceForProgram(program);
        const meta = [program.city, program.state, program.country, team.gender, distance === null ? "" : Math.round(distance) + " miles away"].filter(Boolean).join(" · ");
        container.append(createResourceCard(program.school + " — " + (team.gender === "women" ? "Women's" : "Men's") + " Soccer", meta,
          "Open the university's official schedule for current fixtures and results.", [{ url: team.scheduleUrl, label: "Official schedule" }]));
      });
    });
    if (!count) container.append(makeElement("p", "directory-empty", "No schedule links match the selected filters in the current dataset."));
  }

  async function init() {
    if (window.__masterballerAuthReady) {
      const authenticated = await window.__masterballerAuthReady;
      if (!authenticated) return;
    }

    renderProfile();
    $("year").textContent = new Date().getFullYear();
    await initRecruitingDirectory();

    const current = saveCurrentAssessment();
    const history = readHistory();
    const latest = history[history.length - 1];
    const stats = current?.stats || latest?.stats;

    if (!stats || !scoredTests.every(({ key }) => Number.isFinite(Number(stats[key])))) {
      // Keep recruiting directories accessible even if the player has not assessed yet.
      $("empty-state").hidden = false;
      $("dashboard-content").hidden = false;
      $("overview-grid");
      const scorePanel = document.querySelector(".overview-grid");
      if (scorePanel) scorePanel.hidden = true;
      ["performance", "training", "pathway", "measurements"].forEach(id => {
        const section = $(id);
        if (section) section.hidden = true;
      });
      setActiveNavigation();
      return;
    }

    $("empty-state").hidden = true;
    $("dashboard-content").hidden = false;
    const scorePanel = document.querySelector(".overview-grid");
    if (scorePanel) scorePanel.hidden = false;
    ["performance", "training", "pathway", "measurements"].forEach(id => {
      const section = $(id);
      if (section) section.hidden = false;
    });
    renderScore(stats, history);
    renderSkillCards(stats);
    renderMeasurements(stats);
    renderProgress(history);
    renderTraining(stats, current?.analysis || latest?.analysis || "");
    setActiveNavigation();

    $("history-range").addEventListener("change", () => renderProgress(readHistory()));
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
