
(() => {
  "use strict";

  const RESULT_KEY = "masterballerResults";
  const HISTORY_KEY = "masterballerAssessmentHistory";
  const SAVED_KEY = "masterballerDashboardSaved";
  const TASK_KEY = "masterballerTrainingTasks";
  const PROFILE_KEY = "masterballerProfile";

  const $ = id => document.getElementById(id);

  const safeParse = (value, fallback) => {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  };

  const clamp = (n, min = 0, max = 100) =>
    Math.min(max, Math.max(min, n));

  const toPercent = value => clamp((Number(value) / 10) * 100);

  const formatDate = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? "Unknown date"
      : date.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric"
        });
  };

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

  // ==========================================
  // ASSESSMENT HISTORY
  // ==========================================

  function readHistory() {
    const value = safeParse(localStorage.getItem(HISTORY_KEY), []);
    return Array.isArray(value)
      ? value.filter(item => item && item.stats)
      : [];
  }

  function getAverage(stats) {
    const values = scoredTests.map(({ key }) => Number(stats[key]));

    if (values.some(value => !Number.isFinite(value))) return 0;

    return Math.round(
      values.reduce((sum, value) => sum + toPercent(value), 0) /
      values.length
    );
  }

  function saveCurrentAssessment() {
    const current = safeParse(
      sessionStorage.getItem(RESULT_KEY),
      null
    );

    if (!current || !current.stats ||
        typeof current.stats !== "object") {
      return current;
    }

    const valid = scoredTests.every(({ key }) =>
      Number.isFinite(Number(current.stats[key])) &&
      Number(current.stats[key]) >= 0 &&
      Number(current.stats[key]) <= 10
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

      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(history.slice(-20))
      );

      sessionStorage.setItem(SAVED_KEY, fingerprint);
    }

    return current;
  }

  function renderScore(stats, history) {
    const average = getAverage(stats);

    $("overall-score").textContent = average;
    $("score-caption").textContent = "Average across five scored drills";

    $("score-status").textContent =
      average >= 80
        ? "Strong results."
        : average >= 60
          ? "Building consistency."
          : "Room to develop.";

    $("score-fill").style.width = average + "%";

    $("score-progress").setAttribute(
      "aria-valuenow",
      String(average)
    );

    $("score-count").textContent =
      history.length +
      (history.length === 1
        ? " assessment saved"
        : " assessments saved");

    const latest = history[history.length - 1];

    $("latest-date").textContent = latest
      ? "Latest · " + formatDate(latest.date)
      : "No assessment date";
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
      if (!(key in stats) || stats[key] === null || stats[key] === "") {
        return;
      }

      const row = document.createElement("div");
      row.className = "measurement-row";

      const name = document.createElement("span");
      name.textContent = label;

      const value = document.createElement("strong");

      const suffix = [
        "passing",
        "shooting",
        "defending",
        "possession",
        "goalkeeping"
      ].includes(key)
        ? "/10"
        : (key === "sprint" || key === "dribbling" ? " sec" : "");

      value.textContent = String(stats[key]) + suffix;

      row.append(name, value);
      list.append(row);
    });

    if (!list.children.length) {
      const empty = document.createElement("p");
      empty.className = "chart-note";
      empty.textContent =
        "No additional measurements were included in this assessment.";
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
      $("progress-note").textContent =
        "Complete your first assessment to start tracking progress.";
      $("trend-tag").textContent = "NO DATA";
      return;
    }

    const width = 620;
    const height = 190;
    const padX = 28;
    const padY = 24;

    const points = data.map((item, index) => {
      const x = data.length === 1
        ? width / 2
        : padX + index * (width - 2 * padX) /
          (data.length - 1);

      const average = clamp(
        Number(item.average ?? getAverage(item.stats))
      );

      const y = height - padY -
        (average / 100) * (height - 2 * padY);

      return { x, y, item, average };
    });

    [25, 50, 75].forEach(value => {
      const y = height - padY -
        (value / 100) * (height - 2 * padY);

      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line"
      );

      line.setAttribute("x1", padX);
      line.setAttribute("x2", width - padX);
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      line.setAttribute("class", "chart-gridline");

      chart.append(line);
    });

    if (points.length > 1) {
      const polyline = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "polyline"
      );

      polyline.setAttribute(
        "points",
        points.map(point => point.x + "," + point.y).join(" ")
      );

      polyline.setAttribute("class", "chart-line");
      chart.append(polyline);
    }

    points.forEach(({ x, y, item, average }) => {
      const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );

      circle.setAttribute("cx", x);
      circle.setAttribute("cy", y);
      circle.setAttribute("r", "5");
      circle.setAttribute("class", "chart-point");

      const title = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "title"
      );

      title.textContent =
        formatDate(item.date) + ": " + average + "/100";

      circle.append(title);
      chart.append(circle);

      const label = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "text"
      );

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
      : data.length + " recent assessments · average change " +
        (difference > 0 ? "+" : "") + difference + " points.";
  }

  // ==========================================
  // TRAINING PLANS
  // ==========================================

  const trainingPlans = {
    passing: {
      title: "Build passing accuracy",
      description:
        "Practice short passing against a wall or with a partner. Focus on your plant foot, body position, and a controlled first touch.",
      tasks: [
        ["Wall-pass technique", "10 minutes · controlled passes with both feet"],
        ["First-touch practice", "10 minutes · receive and redirect the ball"],
        ["Target passing", "10 minutes · aim for a clear target"]
      ]
    },

    shooting: {
      title: "Build shooting accuracy",
      description:
        "Use close-range target practice with controlled technique. Prioritize placement and balanced contact before adding power.",
      tasks: [
        ["Controlled striking", "10 minutes · focus on balanced contact"],
        ["Target practice", "10 minutes · aim for different goal areas"],
        ["Weak-foot touches", "5 minutes · comfortable, controlled repetitions"]
      ]
    },

    defending: {
      title: "Develop 1v1 defending",
      description:
        "Practice staying balanced, keeping a safe distance, and guiding an attacker away from space with a partner.",
      tasks: [
        ["Defensive footwork", "8 minutes · stay balanced and move laterally"],
        ["Containment practice", "10 minutes · work with a willing partner"],
        ["Recovery positioning", "8 minutes · reset shape after each repetition"]
      ]
    },

    possession: {
      title: "Improve ball retention",
      description:
        "Use simple keep-away games and close-control drills. Scan before receiving and practice protecting the ball while staying balanced.",
      tasks: [
        ["Close-control touches", "5 minutes · both feet"],
        ["Receive and turn", "10 minutes · check your shoulder first"],
        ["Keep-away practice", "10 minutes · use a partner if available"]
      ]
    },

    goalkeeping: {
      title: "Develop goalkeeping fundamentals",
      description:
        "Practice ready position, footwork, and controlled catching with a suitable partner or coach. Prioritize safe technique.",
      tasks: [
        ["Ready-position footwork", "5 minutes · balanced movement"],
        ["Controlled catching", "10 minutes · gentle, suitable throws"],
        ["Distribution technique", "8 minutes · accurate short passes"]
      ]
    }
  };

  function renderTraining(stats, analysis) {
    const weakest = scoredTests
      .map(item => ({
        ...item,
        value: toPercent(stats[item.key])
      }))
      .sort((a, b) => a.value - b.value)[0];

    const plan = trainingPlans[weakest.key];

    $("focus-title").textContent = plan.title;
    $("focus-description").textContent = plan.description;
    $("focus-score").textContent =
      weakest.value + "/100 on this assessment";

    $("coach-report").textContent = analysis ||
      "Your AI coach report will appear here after you complete the assessment.";

    const savedTasks = safeParse(
      localStorage.getItem(TASK_KEY),
      {}
    );

    const todayKey = new Date().toISOString().slice(0, 10);

    const taskState =
      savedTasks.date === todayKey &&
      savedTasks.key === weakest.key
        ? savedTasks.done || []
        : [];

    const taskList = $("task-list");
    taskList.replaceChildren();

    plan.tasks.forEach(([title, detail], index) => {
      const item = document.createElement("label");

      item.className =
        "task-item" +
        (taskState.includes(index) ? " completed" : "");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "task-check";
      checkbox.checked = taskState.includes(index);

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

      checkbox.addEventListener("change", () => {
        const current = safeParse(
          localStorage.getItem(TASK_KEY),
          {}
        );

        const done = new Set(
          current.date === todayKey &&
          current.key === weakest.key
            ? current.done || []
            : []
        );

        checkbox.checked
          ? done.add(index)
          : done.delete(index);

        localStorage.setItem(
          TASK_KEY,
          JSON.stringify({
            date: todayKey,
            key: weakest.key,
            done: Array.from(done)
          })
        );

        item.classList.toggle("completed", checkbox.checked);

        status.textContent = checkbox.checked
          ? "DONE"
          : "TO DO";

        updateTaskProgress();
      });

      item.append(checkbox, copy, status);
      taskList.append(item);
    });

    updateTaskProgress();
  }

  function updateTaskProgress() {
    const boxes = Array.from(
      document.querySelectorAll(".task-check")
    );

    const done = boxes.filter(box => box.checked).length;

    $("task-progress").textContent =
      done + " of " + boxes.length + " complete";
  }

  // ==========================================
  // PLAYER PROFILE
  // ==========================================

  function renderProfile() {
    const profile = safeParse(
      localStorage.getItem(PROFILE_KEY),
      {}
    );

    const user = window.masterballerUser;
    const metadata = user?.user_metadata || {};

    const name =
      profile.name ||
      metadata.full_name ||
      metadata.name ||
      (user?.email ? user.email.split("@")[0] : "Player");

    const position =
      profile.position ||
      metadata.position ||
      "Soccer development";

    $("player-name").textContent = name;
    $("player-position").textContent = position;

    $("player-avatar").textContent =
      String(name).trim().charAt(0).toUpperCase() || "P";

    $("welcome-message").textContent =
      "Welcome back, " + name + ". Let's build your next level.";
  }

  // ==========================================
  // NAVIGATION
  // ==========================================

  function setActiveNavigation() {
    const links = Array.from(
      document.querySelectorAll(".nav-link[href^='#']")
    );

    const sections = links
      .map(link => document.querySelector(link.getAttribute("href")))
      .filter(Boolean);

    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;

        links.forEach(link => {
          link.classList.toggle(
            "active",
            link.getAttribute("href") === "#" + entry.target.id
          );
        });
      });
    }, {
      rootMargin: "-20% 0px -65% 0px"
    });

    sections.forEach(section => observer.observe(section));
  }

  // ==========================================
  // LOCATION AND RESOURCE DATA
  // ==========================================

  const DATA_URL = "/masterballer-data.json";

  let resourceData = null;
  let locationCoordinates = null;

  function readSavedLocation() {
    const local = safeParse(
      localStorage.getItem(PROFILE_KEY),
      {}
    );

    const metadata =
      window.masterballerUser?.user_metadata || {};

    return {
      city: local.recruitingCity ?? metadata.recruiting_city ?? "",
      state: local.recruitingState ?? metadata.recruiting_state ?? "",
      zip: local.recruitingZip ?? metadata.recruiting_zip ?? "",
      radius: String(
        local.recruitingRadius ??
        metadata.recruiting_radius ??
        100
      )
    };
  }

  async function resolvePlayerLocation(zip) {
    const response = await fetch(
      "https://api.zippopotam.us/us/" +
      encodeURIComponent(zip),
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error("Could not locate that ZIP code.");
    }

    const data = await response.json();
    const place = data.places?.[0];

    if (!place) {
      throw new Error("No location found for that ZIP code.");
    }

    return {
      latitude: Number(place.latitude),
      longitude: Number(place.longitude),
      state: place["state abbreviation"],
      city: place["place name"]
    };
  }

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const radians = degrees => degrees * Math.PI / 180;
    const earthRadius = 3958.8;

    const dLat = radians(lat2 - lat1);
    const dLon = radians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(dLon / 2) ** 2;

    return 2 * earthRadius *
      Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
      );
  }

  function getNearbyPrograms() {
    if (!locationCoordinates || !resourceData) return [];

    const saved = readSavedLocation();
    const radius = Number(saved.radius) || 100;

    return (resourceData.collegePrograms || [])
      .map(program => {
        const latitude = Number(program.latitude);
        const longitude = Number(program.longitude);

        if (!Number.isFinite(latitude) ||
            !Number.isFinite(longitude)) {
          return null;
        }

        return {
          ...program,
          distance: calculateDistance(
            locationCoordinates.latitude,
            locationCoordinates.longitude,
            latitude,
            longitude
          )
        };
      })
      .filter(program =>
        program &&
        Number.isFinite(program.distance) &&
        program.distance <= radius
      )
      .sort((a, b) => a.distance - b.distance);
  }

  function makeExternalLink(
    url,
    label,
    className = "resource-link"
  ) {
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
    copy.textContent =
      description || "Visit the official source for current information.";

    card.append(tag, heading, copy);

    return card;
  }

  // ==========================================
  // D1 COACH DIRECTORY
  // ==========================================

  function renderRecruiting() {
    const target = $("recruiting-results");

    if (!target || !resourceData) return;

    target.replaceChildren();

    if (!locationCoordinates) {
      target.textContent =
        "Enter and save your ZIP code to find nearby D1 coaches.";
      return;
    }

    const gender = $("recruiting-gender")?.value || "both";
    const programs = getNearbyPrograms();

    let count = 0;

    programs.forEach(program => {
      (program.teams || [])
        .filter(team =>
          gender === "both" || team.gender === gender
        )
        .forEach(team => {
          count++;

          const card = makeResourceCard(
            program.school + " · " +
            (team.gender === "men"
              ? "Men's Soccer"
              : "Women's Soccer"),

            program.division + " · " + program.conference,

            program.city + ", " + program.state +
            " · " + Math.round(program.distance) +
            " miles away · Head coach: " +
            (team.headCoach || "See official staff page")
          );

          const contacts = document.createElement("div");
          contacts.className = "contact-list";

          (team.staff || []).forEach(person => {
            const row = document.createElement("div");
            row.className = "contact-row";

            const personName = document.createElement("strong");

            personName.textContent =
              person.name +
              (person.title ? " · " + person.title : "");

            row.append(personName);

            if (person.email) {
              row.append(
                makeExternalLink(
                  "mailto:" + person.email,
                  person.email,
                  "contact-link"
                )
              );
            }

            if (person.phone) {
              row.append(
                makeExternalLink(
                  "tel:" + person.phone.replace(/[^0-9+]/g, ""),
                  person.phone,
                  "contact-link"
                )
              );
            }

            contacts.append(row);
          });

          card.append(contacts);

          const actions = document.createElement("div");
          actions.className = "resource-actions";

          if (team.staffDirectoryUrl) {
            actions.append(
              makeExternalLink(
                team.staffDirectoryUrl,
                "Official coaching staff ↗"
              )
            );
          }

          if (team.scheduleUrl) {
            actions.append(
              makeExternalLink(
                team.scheduleUrl,
                "Team schedule ↗"
              )
            );
          }

          card.append(actions);
          target.append(card);
        });
    });

    if (!count) {
      const empty = document.createElement("p");
      empty.className = "directory-loading";

      const hasCoordinates = (resourceData.collegePrograms || [])
        .some(program =>
          Number.isFinite(Number(program.latitude)) &&
          Number.isFinite(Number(program.longitude))
        );

      empty.textContent = hasCoordinates
        ? "No D1 programs found within your selected radius. Try expanding your search."
        : "College location coordinates have not been added to the database yet.";

      target.append(empty);
    }
  }

  // ==========================================
  // COLLEGE SOCCER GAMES
  // ==========================================

  function renderCollegeSchedules() {
    const target = $("games-results");

    if (!target || !resourceData) return;

    target.replaceChildren();

    if (!locationCoordinates) {
      target.textContent =
        "Save your ZIP code to find nearby college soccer schedules.";
      return;
    }

    const gender = $("games-gender")?.value || "both";
    const programs = getNearbyPrograms();

    let count = 0;

    programs.forEach(program => {
      (program.teams || [])
        .filter(team =>
          gender === "both" || team.gender === gender
        )
        .forEach(team => {
          count++;

          const card = makeResourceCard(
            program.school + " · " +
            (team.gender === "men" ? "Men's" : "Women's"),

            "OFFICIAL COLLEGE SCHEDULE",

            program.city + ", " + program.state +
            " · " + Math.round(program.distance) +
            " miles away"
          );

          if (team.scheduleUrl) {
            card.append(
              makeExternalLink(
                team.scheduleUrl,
                "View official schedule ↗"
              )
            );
          }

          target.append(card);
        });
    });

    if (!count) {
      const empty = document.createElement("p");
      empty.className = "directory-loading";
      empty.textContent =
        "No college schedules found within your selected radius. Try expanding your search.";

      target.append(empty);
    }
  }

  // ==========================================
  // PROFESSIONAL SOCCER CLUBS
  // ==========================================

  function renderClubs() {
    const target = $("club-results");

    if (!target || !resourceData) return;

    target.replaceChildren();

    const selectedLeague =
      $("club-league")?.value || "all";

    const clubs = (resourceData.popularClubs || [])
      .filter(club =>
        selectedLeague === "all" ||
        club.league === selectedLeague
      );

    clubs.forEach(club => {
      const card = makeResourceCard(
        club.name,
        club.league + " · " + club.country,
        "Official club website and club news."
      );

      if (club.officialUrl) {
        card.append(
          makeExternalLink(
            club.officialUrl,
            "Official club website ↗"
          )
        );
      }

      target.append(card);
    });

    if (!clubs.length) {
      const empty = document.createElement("p");
      empty.className = "directory-loading";
      empty.textContent =
        "No clubs match this competition filter.";

      target.append(empty);
    }
  }

  // ==========================================
  // SCHOLARSHIPS
  // ==========================================

  function scholarshipCategory(item) {
    const status = String(
      item.status_as_of_2026_11_21 || ""
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

    const filter =
      $("scholarship-status")?.value || "all";

    const playerState = locationCoordinates?.state;

    const items = resourceData.scholarshipOpportunities || [];

    const visible = items.filter(item => {
      const matchesStatus =
        filter === "all" ||
        scholarshipCategory(item) === filter;

      const allowedStates = item.eligibleStates;

      const matchesLocation =
        !Array.isArray(allowedStates) ||
        (
          playerState &&
          allowedStates.includes(playerState)
        );

      return matchesStatus && matchesLocation;
    });

    visible.forEach(item => {
      const status =
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
        li.textContent =
          "Location restriction: " + item.locationRestriction;
        meta.append(li);
      }

      (item.eligibility || []).slice(0, 4).forEach(rule => {
        const li = document.createElement("li");
        li.textContent = rule;
        meta.append(li);
      });

      card.append(meta);

      if (item.applicationUrl) {
        card.append(
          makeExternalLink(
            item.applicationUrl,
            "View opportunity ↗"
          )
        );
      }

      target.append(card);
    });

    const general = [
      {
        title: "NCAA scholarships & financial aid",
        eyebrow: "OFFICIAL NCAA GUIDANCE",
        description:
          "Learn how Division I, II, and III athletic aid works. Soccer awards can be partial, and coaches—not the NCAA—award school-based athletic scholarships.",
        url:
          "https://www.ncaa.org/student-athletes/scholarships-and-financial-aid/"
      },
      {
        title: "Soccer scholarship search",
        eyebrow: "SCHOLARSHIP DIRECTORY",
        description:
          "Browse soccer-related awards and check each provider's eligibility rules and deadlines.",
        url:
          "https://www.scholarships.com/financial-aid/college-scholarships/sports-scholarships/soccer-scholarships"
      },
      {
        title: "College soccer recruiting & athletic aid",
        eyebrow: "RECRUITING RESOURCE",
        description:
          "Explore college soccer programs and learn how to contact coaches about roster and scholarship opportunities.",
        url:
          "https://www.ncsasports.org/athletic-scholarships"
      }
    ];

    general.forEach(item => {
      const card = makeResourceCard(
        item.title,
        item.eyebrow,
        item.description
      );

      card.append(
        makeExternalLink(item.url, "Explore resource ↗")
      );

      target.append(card);
    });

    if (!visible.length && filter !== "all") {
      const empty = document.createElement("p");
      empty.className = "directory-loading";
      empty.textContent =
        "No individual awards match this filter. Try the directories and NCAA guidance below.";

      target.prepend(empty);
    }
  }

  // ==========================================
  // LOCATION FORM
  // ==========================================

  function populateLocation() {
    const saved = readSavedLocation();

    if ($("profile-city")) {
      $("profile-city").value = saved.city;
    }

    if ($("profile-state")) {
      $("profile-state").value = saved.state;
    }

    if ($("profile-zip")) {
      $("profile-zip").value = saved.zip;
    }

    if ($("search-radius")) {
      $("search-radius").value = saved.radius;
    }
  }

  function setupLocationForm() {
    const form = $("location-form");

    if (!form) return;

    populateLocation();

    form.addEventListener("submit", async event => {
      event.preventDefault();

      const city = $("profile-city").value.trim();
      const state = $("profile-state").value.trim();
      const zip = $("profile-zip").value.trim();
      const radius = Number($("search-radius").value) || 100;

      const status = $("location-status");

      if (!/^\d{5}$/.test(zip)) {
        status.textContent =
          "Enter a valid 5-digit ZIP code.";

        status.classList.add("is-error");
        return;
      }

      if (radius <= 0 || radius > 500) {
        status.textContent =
          "Choose a search radius between 1 and 500 miles.";

        status.classList.add("is-error");
        return;
      }

      status.classList.remove("is-error");
      status.textContent =
        "Updating your recruiting location...";

      try {
        const coordinates = await resolvePlayerLocation(zip);

        const profile = safeParse(
          localStorage.getItem(PROFILE_KEY),
          {}
        );

        Object.assign(profile, {
          recruitingCity: city,
          recruitingState: state || coordinates.state,
          recruitingZip: zip,
          recruitingRadius: radius
        });

        localStorage.setItem(
          PROFILE_KEY,
          JSON.stringify(profile)
        );

        locationCoordinates = coordinates;

        let cloudError = false;

        if (
          window.masterballerUser &&
          typeof supabaseClient !== "undefined"
        ) {
          const { error } =
            await supabaseClient.auth.updateUser({
              data: {
                recruiting_city: city,
                recruiting_state: state || coordinates.state,
                recruiting_zip: zip,
                recruiting_radius: radius
              }
            });

          if (error) {
            cloudError = true;
            console.warn(
              "Could not sync recruiting location:",
              error.message
            );
          }
        }

        // Refresh every location-dependent section.
        renderRecruiting();
        renderCollegeSchedules();
        renderScholarships();

        if (cloudError) {
          status.textContent =
            "Location updated on this device. Cloud sync failed.";
        } else {
          status.textContent =
            "Location updated! Your nearby resources have been refreshed.";
        }

      } catch (error) {
        status.classList.add("is-error");

        status.textContent =
          error.message ||
          "Could not update your recruiting location.";

        console.error("Location update failed:", error);
      }
    });
  }

  // ==========================================
  // RESOURCE HUB INITIALIZATION
  // ==========================================

  
async function initResourceHub() {
  setupLocationForm();

  try {
    // Load the resource database.
    const response = await fetch("/masterballer-data.json", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(
        "Data request failed: " + response.status
      );
    }

    // Read the JSON response only once.
    resourceData = await response.json();

    if (!resourceData || typeof resourceData !== "object") {
      throw new Error("The resource database has an invalid format.");
    }

    console.log("MasterBaller data loaded:", resourceData);

    // Restore the player's previously saved location.
    const savedLocation = readSavedLocation();

    locationCoordinates = null;

    if (savedLocation.zip) {
      try {
        locationCoordinates = await resolvePlayerLocation(
          savedLocation.zip
        );
      } catch (error) {
        console.warn(
          "Could not load saved recruiting location:",
          error
        );
      }
    }

    // Render all resource sections.
    renderRecruiting();
    renderCollegeSchedules();
    renderClubs();
    renderScholarships();

    // Set up filters.
    $("recruiting-gender")?.addEventListener(
      "change",
      renderRecruiting
    );

    $("games-gender")?.addEventListener(
      "change",
      renderCollegeSchedules
    );

    $("club-league")?.addEventListener(
      "change",
      renderClubs
    );

    $("scholarship-status")?.addEventListener(
      "change",
      renderScholarships
    );

    // Add available club league options.
    const leagueSelect = $("club-league");

    if (leagueSelect) {
      const existing = new Set(
        Array.from(leagueSelect.options).map(
          option => option.value
        )
      );

      [...new Set(
        (resourceData.popularClubs || [])
          .map(club => club.league)
      )].sort().forEach(league => {
        if (existing.has(league)) return;

        const option = document.createElement("option");
        option.value = league;
        option.textContent = league;

        leagueSelect.append(option);
      });
    }

  } catch (error) {
    console.error(
      "MasterBaller resource data failed to load:",
      error
    );

    [
      "recruiting-results",
      "games-results",
      "club-results",
      "scholarship-results"
    ].forEach(id => {
      const target = $(id);

      if (target) {
        target.textContent =
          "Data loading error: " + error.message;
      }
    });
  }
}


  // ==========================================
  // MAIN DASHBOARD INITIALIZATION
  // ==========================================

  async function init() {
    if (window.__masterballerAuthReady) {
      const authenticated =
        await window.__masterballerAuthReady;

      if (!authenticated) return;
    }

    const current = saveCurrentAssessment();
    const history = readHistory();
    const latest = history[history.length - 1];

    const stats = current?.stats || latest?.stats;

    renderProfile();

    $("year").textContent = new Date().getFullYear();

    if (
      !stats ||
      !scoredTests.every(({ key }) =>
        Number.isFinite(Number(stats[key]))
      )
    ) {
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

    renderTraining(
      stats,
      current?.analysis || latest?.analysis || ""
    );

    await initResourceHub();

    setActiveNavigation();

    $("history-range").addEventListener(
      "change",
      () => renderProgress(readHistory())
    );
  }

  // ==========================================
  // MOBILE MENU
  // ==========================================

  const menuToggle = $("menu-toggle");

  if (menuToggle) {
    menuToggle.addEventListener("click", () => {
      const sidebar = $("sidebar");
      const open = sidebar.classList.toggle("is-open");

      menuToggle.setAttribute(
        "aria-expanded",
        String(open)
      );
    });
  }

  document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", () => {
      $("sidebar")?.classList.remove("is-open");

      menuToggle?.setAttribute(
        "aria-expanded",
        "false"
      );
    });
  });

  // ==========================================
  // START DASHBOARD
  // ==========================================

  init().catch(error => {
    console.error(
      "MasterBaller dashboard failed to initialize:",
      error
    );

    if ($("empty-state")) {
      $("empty-state").hidden = false;
    }

    if ($("dashboard-content")) {
      $("dashboard-content").hidden = true;
    }
  });

})();
