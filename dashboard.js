(() => {
  "use strict";

  const RESULT_KEY = "masterballerResults";
  const HISTORY_KEY = "masterballerAssessmentHistory";
  const SAVED_KEY = "masterballerDashboardSaved";

  const labels = {
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

  // These five tests have an explicit denominator in the assessment.
  // Their percentages are test-result conversions, not professional ratings.
  const scoredTests = [
    { key: "passing", label: "Passing", note: "Accurate passes out of 10", icon: "◎" },
    { key: "shooting", label: "Shooting", note: "Shots on target out of 10", icon: "↗" },
    { key: "defending", label: "Defense", note: "Successful 1v1 stops out of 10", icon: "◇" },
    { key: "possession", label: "Ball retention", note: "Successful attempts out of 10", icon: "◉" },
    { key: "goalkeeping", label: "Goalkeeping", note: "Saves out of 10", icon: "⌁" }
  ];

  const $ = (id) => document.getElementById(id);
  const safeParse = (value, fallback) => {
    try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
  };
  const clamp = (n, min = 0, max = 100) => Math.min(max, Math.max(min, n));
  const toPercent = (value) => clamp((Number(value) / 10) * 100);
  const formatDate = (value) => new Date(value).toLocaleDateString(undefined, {
    month: "short", day: "numeric"
  });

  function readHistory() {
    const value = safeParse(localStorage.getItem(HISTORY_KEY), []);
    return Array.isArray(value) ? value : [];
  }

  function saveCurrentAssessment() {
    const current = safeParse(sessionStorage.getItem(RESULT_KEY), null);
    if (!current || !current.stats || typeof current.stats !== "object") return null;

    const stats = current.stats;
    const valid = scoredTests.every(({ key }) =>
      Number.isFinite(Number(stats[key])) && Number(stats[key]) >= 0 && Number(stats[key]) <= 10
    );
    if (!valid) return null;

    const fingerprint = JSON.stringify(stats);
    if (sessionStorage.getItem(SAVED_KEY) !== fingerprint) {
      const history = readHistory();
      const entry = {
        id: Date.now(),
        date: new Date().toISOString(),
        stats,
        average: Math.round(scoredTests.reduce((sum, item) => sum + toPercent(stats[item.key]), 0) / scoredTests.length)
      };
      history.push(entry);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-20)));
      sessionStorage.setItem(SAVED_KEY, fingerprint);
    }
    return current;
  }

  function getAverage(stats) {
    return Math.round(scoredTests.reduce((sum, item) => sum + toPercent(stats[item.key]), 0) / scoredTests.length);
  }

  function renderScore(stats, history) {
    const average = getAverage(stats);
    $("overall-score").textContent = average;
    $("score-caption").textContent = "Average across 5 scored drills";
    $("score-status").textContent = average >= 80 ? "Strong results" : average >= 60 ? "Building consistency" : "Room to develop";
    $("score-fill").style.width = average + "%";
    $("score-count").textContent = history.length + (history.length === 1 ? " assessment saved" : " assessments saved");
    $("latest-date").textContent = history.length ? "Latest assessment · " + formatDate(history[history.length - 1].date) : "No assessment date";
  }

  function renderSkillCards(stats) {
    $("skill-grid").replaceChildren();
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
      score.textContent = value + "%";
      const bar = document.createElement("div");
      bar.className = "skill-track";
      const fill = document.createElement("span");
      fill.style.width = value + "%";
      bar.append(fill);
      const detail = document.createElement("p");
      detail.className = "skill-note";
      detail.textContent = note + " · " + Number(stats[key]) + "/10";
      card.append(top, score, bar, detail);
      $("skill-grid").append(card);
    });
  }

  function renderMeasurements(stats) {
    $("measurement-list").replaceChildren();
    Object.entries(labels).forEach(([key, label]) => {
      if (!(key in stats)) return;
      const row = document.createElement("div");
      row.className = "measurement-row";
      const name = document.createElement("span");
      name.textContent = label;
      const value = document.createElement("strong");
      value.textContent = String(stats[key]) + (
        ["passing", "shooting", "defending", "possession", "goalkeeping"].includes(key) ? "/10" :
        key === "sprint" || key === "dribbling" ? " sec" :
        key === "distance" ? " (unit not recorded)" : ""
      );
      row.append(name, value);
      $("measurement-list").append(row);
    });
  }

  function renderProgress(history) {
    const chart = $("progress-chart");
    chart.replaceChildren();
    if (!history.length) {
      $("progress-note").textContent = "Complete your first assessment to start tracking progress.";
      return;
    }
    const data = history.slice(-8);
    const width = 620, height = 190, pad = 24;
    const min = 0, max = 100;
    const points = data.map((item, index) => {
      const x = data.length === 1 ? width / 2 : pad + index * (width - 2 * pad) / (data.length - 1);
      const y = height - pad - ((clamp(item.average) - min) / (max - min)) * (height - 2 * pad);
      return { x, y, item };
    });
    [25, 50, 75].forEach((v) => {
      const y = height - pad - (v / 100) * (height - 2 * pad);
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", pad); line.setAttribute("x2", width - pad);
      line.setAttribute("y1", y); line.setAttribute("y2", y);
      line.setAttribute("class", "chart-gridline");
      chart.append(line);
    });
    if (points.length > 1) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      path.setAttribute("points", points.map(p => p.x + "," + p.y).join(" "));
      path.setAttribute("class", "chart-line");
      chart.append(path);
    }
    points.forEach(({ x, y, item }) => {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", x); circle.setAttribute("cy", y); circle.setAttribute("r", "5");
      circle.setAttribute("class", "chart-point");
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = formatDate(item.date) + ": " + item.average + "% drill average";
      circle.append(title); chart.append(circle);
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.setAttribute("x", x); label.setAttribute("y", Math.max(14, y - 12));
      label.setAttribute("text-anchor", "middle"); label.setAttribute("class", "chart-value");
      label.textContent = item.average;
      chart.append(label);
    });
    $("progress-note").textContent = data.length === 1
      ? "One assessment saved. Complete another assessment to compare results."
      : data.length + " recent assessments · drill average";
  }

  function renderTraining(stats, analysis) {
    const weakest = scoredTests.map(item => ({ ...item, value: toPercent(stats[item.key]) }))
      .sort((a, b) => a.value - b.value)[0];
    const plans = {
      passing: ["Build passing accuracy", "Practice short passing against a wall or with a partner. Focus on your plant foot, body position, and a controlled first touch."],
      shooting: ["Build shooting accuracy", "Use close-range target practice with controlled technique. Prioritize placement and balanced contact before adding power."],
      defending: ["Develop 1v1 defending", "Practice staying balanced, keeping a safe distance, and guiding an attacker away from space with a partner."],
      possession: ["Improve ball retention", "Use simple keep-away games and close-control drills. Scan before receiving and practice protecting the ball while staying balanced."],
      goalkeeping: ["Develop goalkeeping fundamentals", "Practice ready position, footwork, and controlled catching with a suitable partner or coach. Prioritize safe technique."]
    };
    const plan = plans[weakest.key];
    $("focus-title").textContent = plan[0];
    $("focus-description").textContent = plan[1];
    $("focus-score").textContent = weakest.value + "% on this assessment";
    $("coach-report").textContent = analysis || "Your AI coach report will appear here after you complete the assessment.";
  }

  function init() {
    const current = saveCurrentAssessment();
    const history = readHistory();
    const latest = history[history.length - 1];
    const stats = current?.stats || latest?.stats;

    if (!stats) {
      $("empty-state").hidden = false;
      $("dashboard-content").hidden = true;
      return;
    }

    $("empty-state").hidden = true;
    $("dashboard-content").hidden = false;
    const profile = safeParse(localStorage.getItem("masterballerProfile"), {});
    $("player-name").textContent = profile.name || "Player";
    $("player-position").textContent = profile.position || "Soccer development";
    renderScore(stats, history);
    renderSkillCards(stats);
    renderMeasurements(stats);
    renderProgress(history);
    renderTraining(stats, current?.analysis || "");
  }

  const toggle = document.querySelector(".menu-toggle");
  if (toggle) toggle.addEventListener("click", () => {
    document.querySelector(".sidebar").classList.toggle("is-open");
  });
  $("year").textContent = new Date().getFullYear();
  init();
})();