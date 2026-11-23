
/* =========================================================
   MASTERBALLER WORLDWIDE COLLEGE SOCCER DIRECTORY
   Add this block AFTER the existing dashboard.js code.
   Data file: /masterballer-data.json
========================================================= */

(() => {
  "use strict";

  const DATA_URL = "/masterballer-data.json";
  const PROFILE_KEY = "masterballerProfile";

  const $ = id => document.getElementById(id);

  let directory = null;
  let locationData = null;

  const COUNTRY_CODES = {
    "United States": "US",
    "Canada": "CA",
    "United Kingdom": "GB",
    "Ireland": "IE",
    "Australia": "AU",
    "New Zealand": "NZ",
    "India": "IN",
    "Germany": "DE",
    "France": "FR",
    "Spain": "ES",
    "Italy": "IT",
    "Netherlands": "NL",
    "Portugal": "PT",
    "Brazil": "BR",
    "Mexico": "MX",
    "Japan": "JP",
    "Sweden": "SE",
    "Norway": "NO",
    "Denmark": "DK",
    "Belgium": "BE",
    "Switzerland": "CH",
    "South Africa": "ZA",
    "Ghana": "GH",
    "Nigeria": "NG",
    "Argentina": "AR",
    "Chile": "CL",
    "Colombia": "CO",
    "South Korea": "KR",
    "Poland": "PL",
    "Austria": "AT"
  };

  function parseJSON(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);

    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;

    return node;
  }

  function addCard(container, title, subtitle, description, links = [], note = "") {
    if (!container) return;

    const card = element("article", "resource-card");
    card.append(element("h4", "resource-card-title", title));

    if (subtitle) {
      card.append(element("p", "resource-card-meta", subtitle));
    }

    if (description) {
      card.append(element("p", "resource-card-description", description));
    }

    if (note) {
      card.append(element("p", "resource-card-meta", note));
    }

    if (links.length) {
      const linkContainer = element("div", "resource-card-links");

      links.forEach(item => {
        if (!item.url) return;

        const link = element("a", "resource-link", item.label);
        link.href = item.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";

        linkContainer.append(link);
      });

      card.append(linkContainer);
    }

    container.append(card);
  }

  function getLocation() {
    const profile = parseJSON(
      localStorage.getItem(PROFILE_KEY),
      {}
    );

    return {
      country: profile.country || "US",
      city: profile.city || "",
      state: profile.state || "",
      zip: profile.zip || "",
      radius: Number(profile.radius) || 100,
      latitude: Number.isFinite(Number(profile.latitude))
        ? Number(profile.latitude)
        : null,
      longitude: Number.isFinite(Number(profile.longitude))
        ? Number(profile.longitude)
        : null
    };
  }

  function distanceMiles(lat1, lon1, lat2, lon2) {
    const rad = value => value * Math.PI / 180;

    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(lat1)) *
      Math.cos(rad(lat2)) *
      Math.sin(dLon / 2) ** 2;

    return 3958.7613 *
      2 *
      Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async function lookupZIP(zip, country) {
    if (!zip || country === "ALL") return null;

    try {
      const response = await fetch(
        "https://api.zippopotam.us/" +
        encodeURIComponent(country.toLowerCase()) +
        "/" +
        encodeURIComponent(zip.trim())
      );

      if (!response.ok) return null;

      const result = await response.json();
      const place = result.places?.[0];

      if (!place) return null;

      return {
        latitude: Number(place.latitude),
        longitude: Number(place.longitude),
        city: place["place name"] || "",
        state: place.state || ""
      };
    } catch (error) {
      console.error("ZIP lookup failed:", error);
      return null;
    }
  }

  function countryCode(country) {
    return COUNTRY_CODES[country] || country || "";
  }

  function getDistance(record) {
    if (
      locationData.latitude === null ||
      locationData.longitude === null ||
      record.latitude == null ||
      record.longitude == null
    ) {
      return null;
    }

    return distanceMiles(
      locationData.latitude,
      locationData.longitude,
      Number(record.latitude),
      Number(record.longitude)
    );
  }

  function filterLocation(records) {
    if (locationData.country === "ALL") {
      return records.slice();
    }

    return records.filter(record => {
      const recordCountry = countryCode(record.countryCode || record.country);

      if (recordCountry.toUpperCase() !== locationData.country.toUpperCase()) {
        return false;
      }

      const distance = getDistance(record);

      // Records without coordinates remain visible.
      if (distance === null) return true;

      return distance <= locationData.radius;
    });
  }

  function renderPrograms() {
    const container = $("recruiting-results");
    if (!container || !directory) return;

    container.replaceChildren();

    const gender = $("recruiting-gender")?.value || "both";

    const programs = filterLocation(
      directory.collegePrograms || []
    );

    programs.sort((a, b) => {
      const da = getDistance(a);
      const db = getDistance(b);

      if (da === null && db === null) {
        return String(a.school).localeCompare(String(b.school));
      }

      if (da === null) return 1;
      if (db === null) return -1;

      return da - db;
    });

    if (!programs.length) {
      container.append(
        element(
          "p",
          "directory-empty",
          "No official university programs match your location and radius in the current database."
        )
      );
      return;
    }

    programs.forEach(program => {
      const teams = (program.teams || []).filter(team =>
        gender === "both" || team.gender === gender
      );

      if (!teams.length) return;

      const links = [];

      teams.forEach(team => {
        const label = team.gender === "women" ? "Women's" : "Men's";

        if (team.staffDirectoryUrl) {
          links.push({
            url: team.staffDirectoryUrl,
            label: label + " coaches"
          });
        }

        if (team.scheduleUrl) {
          links.push({
            url: team.scheduleUrl,
            label: label + " schedule"
          });
        }
      });

      const details = teams.map(team =>
        (team.gender === "women" ? "Women's" : "Men's") +
        " soccer — " +
        (team.headCoach || "Coach information unavailable")
      ).join(" · ");

      const distance = getDistance(program);

      const subtitle = [
        program.city,
        program.state,
        program.country,
        program.division,
        program.conference,
        distance === null ? "" : Math.round(distance) + " miles away"
      ].filter(Boolean).join(" · ");

      addCard(
        container,
        program.school,
        subtitle,
        details,
        links,
        program.verificationStatus === "verified"
          ? "Verified program record"
          : "Confirm current details through the official university"
      );
    });
  }

  function renderGames() {
    const container = $("games-results");
    if (!container || !directory) return;

    container.replaceChildren();

    const gender = $("games-gender")?.value || "both";
    const programs = filterLocation(directory.collegePrograms || []);

    let count = 0;

    programs.forEach(program => {
      (program.teams || []).forEach(team => {
        if (gender !== "both" && team.gender !== gender) return;
        if (!team.scheduleUrl) return;

        count++;

        const distance = getDistance(program);

        addCard(
          container,
          program.school + " — " +
            (team.gender === "women" ? "Women's" : "Men's") +
            " Soccer",
          [
            program.city,
            program.state,
            program.country,
            distance === null ? "" : Math.round(distance) + " miles away"
          ].filter(Boolean).join(" · "),
          "View the university's official fixtures and results.",
          [{
            url: team.scheduleUrl,
            label: "Official schedule"
          }]
        );
      });
    });

    if (!count) {
      container.append(
        element("p", "directory-empty", "No matching schedules are available in the current dataset.")
      );
    }
  }

  function createUniversityClubSection() {
    const hub = $("recruiting-hub");

    if (!hub || $("university-club-results")) return;

    const section = element("section", "content-panel");
    section.id = "university-club-section";
    section.style.marginTop = "24px";

    section.append(
      element("h3", "", "University Soccer Clubs"),
      element(
        "p",
        "",
        "Discover student-run competitive, recreational, social, and futsal clubs."
      )
    );

    const type = element("select");
    type.id = "university-club-type";

    [
      ["all", "All club types"],
      ["competitive", "Competitive"],
      ["recreational", "Recreational"],
      ["futsal", "Futsal"],
      ["social", "Social"]
    ].forEach(([value, label]) => {
      const option = element("option", "", label);
      option.value = value;
      type.append(option);
    });

    const gender = element("select");
    gender.id = "university-club-gender";

    [
      ["all", "All teams"],
      ["men", "Men"],
      ["women", "Women"],
      ["coed", "Co-ed"],
      ["open", "Open"]
    ].forEach(([value, label]) => {
      const option = element("option", "", label);
      option.value = value;
      gender.append(option);
    });

    const typeLabel = element("label", "location-field", "Club type");
    typeLabel.append(type);

    const genderLabel = element("label", "location-field", "Team");
    genderLabel.append(gender);

    const filters = element("div", "directory-toolbar");
    filters.append(typeLabel, genderLabel);

    const results = element("div", "resource-grid");
    results.id = "university-club-results";

    section.append(filters, results);

    section.append(
      element(
        "p",
        "resource-footnote",
        "Club listings must be verified through a current university or club source. Confirm membership requirements and tryouts directly."
      )
    );

    const games = $("games-results");

    if (games?.parentElement) {
      games.parentElement.insertAdjacentElement("afterend", section);
    } else {
      hub.append(section);
    }

    type.addEventListener("change", renderUniversityClubs);
    gender.addEventListener("change", renderUniversityClubs);
  }

  function renderUniversityClubs() {
    const container = $("university-club-results");
    if (!container || !directory) return;

    container.replaceChildren();

    const type = $("university-club-type")?.value || "all";
    const gender = $("university-club-gender")?.value || "all";

    const clubs = filterLocation(directory.universityClubs || [])
      .filter(club =>
        (type === "all" || club.clubType === type) &&
        (gender === "all" || club.gender === gender)
      );

    if (!clubs.length) {
      container.append(
        element(
          "p",
          "directory-empty",
          "No individual university club listings have been added for these filters yet. Check the directory sources below."
        )
      );
      return;
    }

    clubs.forEach(club => {
      const links = [];

      if (club.officialUrl) {
        links.push({
          url: club.officialUrl,
          label: "Official club page"
        });
      }

      if (club.contactUrl) {
        links.push({
          url: club.contactUrl,
          label: "Contact club"
        });
      }

      const distance = getDistance(club);

      addCard(
        container,
        club.clubName || club.school + " Soccer Club",
        [
          club.school,
          club.city,
          club.state,
          club.country,
          club.clubType,
          club.gender,
          distance === null ? "" : Math.round(distance) + " miles away"
        ].filter(Boolean).join(" · "),
        club.leagueOrAssociation || "University-affiliated soccer club",
        links,
        club.verificationStatus || "Needs verification"
      );
    });
  }

  function renderProfessionalClubs() {
    const container = $("club-results");
    if (!container || !directory) return;

    container.replaceChildren();

    const select = $("club-league");
    const clubs = directory.popularClubs || [];

    if (select && select.options.length <= 1) {
      [...new Set(clubs.map(club => club.league).filter(Boolean))]
        .sort()
        .forEach(league => {
          const option = element("option", "", league);
          option.value = league;
          select.append(option);
        });
    }

    const league = select?.value || "all";

    clubs
      .filter(club => league === "all" || club.league === league)
      .forEach(club => {
        addCard(
          container,
          club.name,
          [club.league, club.country].filter(Boolean).join(" · "),
          "Official professional club website",
          [{
            url: club.officialUrl,
            label: "Official website"
          }]
        );
      });
  }

  function getScholarshipStatus(item) {
    const status = String(item.status || "").toLowerCase();

    if (status.includes("directory")) return "directory";
    if (status.includes("closed")) return "closed";
    if (status.includes("upcoming")) return "upcoming";
    if (status.includes("open")) return "open";

    if (item.deadline) {
      const deadline = new Date(item.deadline);

      if (!Number.isNaN(deadline.getTime()) && deadline < new Date()) {
        return "closed";
      }
    }

    return "all";
  }

  function renderScholarships() {
    const container = $("scholarship-results");
    if (!container || !directory) return;

    container.replaceChildren();

    const filter = $("scholarship-status")?.value || "all";

    (directory.scholarshipOpportunities || [])
      .filter(item => {
        const status = getScholarshipStatus(item);
        return filter === "all" || filter === status;
      })
      .forEach(item => {
        addCard(
          container,
          item.name,
          [
            item.amount,
            item.scope,
            item.deadline ? "Deadline: " + item.deadline : ""
          ].filter(Boolean).join(" · "),
          Array.isArray(item.eligibility)
            ? item.eligibility.join("; ")
            : "Check provider requirements.",
          item.applicationUrl
            ? [{
                url: item.applicationUrl,
                label: "Official details / application"
              }]
            : [],
          item.status || "Check current status"
        );
      });
  }

  function renderDirectorySources() {
    const hub = $("recruiting-hub");
    if (!hub || $("directory-source-results")) return;

    const section = element("section", "content-panel");
    section.style.marginTop = "24px";

    section.append(
      element("h3", "", "Explore More University Directories"),
      element(
        "p",
        "",
        "These sources help discover additional programs and student clubs. Verify individual listings before relying on them."
      )
    );

    const results = element("div", "resource-grid");
    results.id = "directory-source-results";

    (directory.directorySources || []).forEach(source => {
      addCard(
        results,
        source.name,
        [source.country, source.category].filter(Boolean).join(" · "),
        source.use,
        [{
          url: source.url,
          label: "Open directory"
        }],
        source.verificationStatus
      );
    });

    section.append(results);
    hub.append(section);
  }

  async function saveLocation(event) {
    event.preventDefault();

    const status = $("location-status");
    const button = $("save-location");

    const country = $("profile-country")?.value || "US";
    const city = $("profile-city")?.value.trim() || "";
    const state = $("profile-state")?.value.trim() || "";
    const zip = $("profile-zip")?.value.trim() || "";
    const radius = Number($("search-radius")?.value) || 100;

    if (status) status.textContent = "Saving location...";
    if (button) button.disabled = true;

    let coordinates = null;

    if (zip && country !== "ALL") {
      coordinates = await lookupZIP(zip, country);
    }

    const profile = parseJSON(
      localStorage.getItem(PROFILE_KEY),
      {}
    );

    const updated = {
      ...profile,
      country,
      city,
      state,
      zip,
      radius
    };

    if (coordinates) {
      updated.latitude = coordinates.latitude;
      updated.longitude = coordinates.longitude;
      updated.city = city || coordinates.city;
      updated.state = state || coordinates.state;
    } else {
      delete updated.latitude;
      delete updated.longitude;
    }

    localStorage.setItem(PROFILE_KEY, JSON.stringify(updated));

    locationData = getLocation();

    if (status) {
      if (zip && !coordinates) {
        status.textContent =
          "Location saved, but ZIP lookup failed. Country filtering is active; radius filtering needs valid coordinates.";
      } else {
        status.textContent =
          "Location saved. Recruiting results have been refreshed.";
      }
    }

    if (button) button.disabled = false;

    refreshAll();
  }

  function populateLocationForm() {
    locationData = getLocation();

    const country = $("profile-country");

    if (country && !country.querySelector('option[value="ALL"]')) {
      const worldwide = element("option", "", "Worldwide");
      worldwide.value = "ALL";
      country.insertBefore(worldwide, country.firstChild);
    }

    const values = {
      "profile-country": locationData.country,
      "profile-city": locationData.city,
      "profile-state": locationData.state,
      "profile-zip": locationData.zip,
      "search-radius": String(locationData.radius)
    };

    Object.entries(values).forEach(([id, value]) => {
      const field = $(id);
      if (field) field.value = value;
    });
  }

  function refreshAll() {
    renderPrograms();
    renderGames();
    renderUniversityClubs();
    renderProfessionalClubs();
    renderScholarships();
  }

  async function initialize() {
    populateLocationForm();

    const form = $("location-form");
    if (form) form.addEventListener("submit", saveLocation);

    $("recruiting-gender")?.addEventListener("change", renderPrograms);
    $("games-gender")?.addEventListener("change", renderGames);
    $("club-league")?.addEventListener("change", renderProfessionalClubs);
    $("scholarship-status")?.addEventListener("change", renderScholarships);

    createUniversityClubSection();

    try {
      const response = await fetch(DATA_URL, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("Could not load directory data: " + response.status);
      }

      directory = await response.json();

      directory.collegePrograms ||= [];
      directory.universityClubs ||= [];
      directory.popularClubs ||= [];
      directory.scholarshipOpportunities ||= [];
      directory.directorySources ||= [];

      renderDirectorySources();
      refreshAll();

    } catch (error) {
      console.error("MasterBaller directory error:", error);

      [
        "recruiting-results",
        "games-results",
        "club-results",
        "scholarship-results"
      ].forEach(id => {
        const container = $(id);

        if (container) {
          container.textContent =
            "Could not load directory data. Check masterballer-data.json.";
        }
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }

})();
