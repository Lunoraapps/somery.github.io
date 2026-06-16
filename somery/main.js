const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");

// Public Supabase Storage object URL. No anon key is required for this JSON file.
const RELEASES_JSON_URL = "https://psjnupcbpjswihsrnoyu.supabase.co/storage/v1/object/public/public-assets/releases.json";
const SECTION_STATE_PREFIX = "somery.changelog.section.";
const FILTERS = [
    { key: "all", label: "All" },
    { key: "features", label: "Features" },
    { key: "improvements", label: "Improvements" },
    { key: "fixes", label: "Fixes" },
    { key: "performance", label: "Performance" },
    { key: "maintenance", label: "Maintenance" },
];

if (navToggle && navLinks) {
    navToggle.addEventListener("click", () => {
        const isOpen = navLinks.classList.toggle("is-open");
        navToggle.setAttribute("aria-expanded", String(isOpen));
    });

    navLinks.querySelectorAll("a").forEach((link) => {
        link.addEventListener("click", () => {
            navLinks.classList.remove("is-open");
            navToggle.setAttribute("aria-expanded", "false");
        });
    });
}

const releaseList = document.querySelector("[data-releases-list]");
const changelogControls = document.querySelector("[data-changelog-controls]");
let revealObserver = null;
let changelogState = {
    activeFilter: "all",
    sections: [],
};

if ("IntersectionObserver" in window) {
    revealObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    revealObserver.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.12 }
    );

    document.querySelectorAll(".reveal").forEach((item) => revealObserver.observe(item));
} else {
    document.querySelectorAll(".reveal").forEach((item) => item.classList.add("is-visible"));
}

function observeRevealItem(item) {
    if (revealObserver) {
        revealObserver.observe(item);
    } else {
        item.classList.add("is-visible");
    }
}

function createElement(tagName, className, text) {
    const element = document.createElement(tagName);

    if (className) {
        element.className = className;
    }

    if (typeof text === "string") {
        element.textContent = text;
    }

    return element;
}

function createButton(className, text, type = "button") {
    const button = document.createElement("button");
    button.className = className;
    button.type = type;
    button.textContent = text;
    return button;
}

function normalizeValue(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/_/g, "-")
        .replace(/\s+/g, "-");
}

function getField(release, camelName, snakeName) {
    if (release && release[camelName] !== undefined) {
        return release[camelName];
    }

    if (release && snakeName && release[snakeName] !== undefined) {
        return release[snakeName];
    }

    return "";
}

function parseSemver(version) {
    const match = String(version || "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)/i);

    if (!match) {
        return null;
    }

    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
    };
}

function compareVersionsDescending(a, b) {
    const left = parseSemver(a);
    const right = parseSemver(b);

    if (!left && !right) {
        return 0;
    }

    if (!left) {
        return 1;
    }

    if (!right) {
        return -1;
    }

    return right.major - left.major || right.minor - left.minor || right.patch - left.patch;
}

function getMinorSeries(version) {
    const semver = parseSemver(version);

    if (!semver) {
        return "Other";
    }

    return `${semver.major}.${semver.minor}.x`;
}

function getTimestamp(value) {
    if (!value) {
        return 0;
    }

    const timestamp = new Date(value).getTime();
    return Number.isNaN(timestamp) ? 0 : timestamp;
}

function formatDate(value) {
    const timestamp = getTimestamp(value);

    if (!timestamp) {
        return "";
    }

    return new Intl.DateTimeFormat(navigator.language || "en", {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(new Date(timestamp));
}

function formatReleaseType(value) {
    const normalized = normalizeValue(value);

    if (!normalized) {
        return "release";
    }

    return normalized.replace(/-/g, " ");
}

function getReleaseType(release) {
    return getField(release, "releaseType", "release_type");
}

function getUserSummary(release) {
    return getField(release, "userSummary", "user_summary");
}

function getMergedAt(release) {
    return getField(release, "mergedAt", "merged_at");
}

function getPublishedAt(release) {
    return getField(release, "publishedAt", "published_at");
}

function getReleaseTokens(release) {
    const tokens = new Set();
    const releaseType = normalizeValue(getReleaseType(release));

    if (releaseType) {
        tokens.add(releaseType);
    }

    if (Array.isArray(release.changes)) {
        release.changes.forEach((change) => {
            const type = normalizeValue(change && change.type);

            if (type) {
                tokens.add(type);
            }
        });
    }

    return tokens;
}

function releaseMatchesFilter(release, filterKey) {
    if (filterKey === "all") {
        return true;
    }

    const tokens = getReleaseTokens(release);

    if (filterKey === "features") {
        return tokens.has("feature") || tokens.has("features") || tokens.has("minor") || tokens.has("major");
    }

    if (filterKey === "improvements") {
        return tokens.has("improvement") || tokens.has("improvements") || tokens.has("enhancement") || tokens.has("enhancements");
    }

    if (filterKey === "fixes") {
        return tokens.has("fix") || tokens.has("fixes") || tokens.has("bug-fix") || tokens.has("bugfix");
    }

    if (filterKey === "performance") {
        return tokens.has("performance") || tokens.has("perf");
    }

    if (filterKey === "maintenance") {
        return tokens.has("maintenance") || tokens.has("maint") || tokens.has("chore") || tokens.has("chores");
    }

    return false;
}

function getSectionStorageKey(seriesKey) {
    return `${SECTION_STATE_PREFIX}${seriesKey}`;
}

function getStoredSectionState(seriesKey, isNewestSection) {
    const stored = localStorage.getItem(getSectionStorageKey(seriesKey));

    if (stored === "open") {
        return true;
    }

    if (stored === "closed") {
        return false;
    }

    return isNewestSection;
}

function setStoredSectionState(seriesKey, isOpen) {
    localStorage.setItem(getSectionStorageKey(seriesKey), isOpen ? "open" : "closed");
}

function createReleaseState(message, type) {
    const state = createElement("div", "release-state");

    if (type === "error") {
        state.classList.add("is-error");
    }

    state.append(createElement("p", "", message));

    if (type === "error") {
        const retry = createButton("release-state-action", "Retry");
        retry.addEventListener("click", loadSomeryReleases);
        state.append(retry);
    }

    return state;
}

function normalizeReleasesPayload(payload) {
    if (Array.isArray(payload)) {
        return payload;
    }

    if (payload && Array.isArray(payload.releases)) {
        return payload.releases;
    }

    return [];
}

function buildReleaseGroups(releases) {
    const grouped = new Map();

    releases.forEach((release) => {
        const version = getField(release, "version");
        const seriesKey = getMinorSeries(version);

        if (!grouped.has(seriesKey)) {
            grouped.set(seriesKey, []);
        }

        grouped.get(seriesKey).push(release);
    });

    return Array.from(grouped.entries())
        .map(([seriesKey, entries]) => {
            const sortedEntries = entries.slice().sort((a, b) => {
                const mergedDiff = getTimestamp(getMergedAt(b)) - getTimestamp(getMergedAt(a));

                if (mergedDiff) {
                    return mergedDiff;
                }

                const publishedDiff = getTimestamp(getPublishedAt(b)) - getTimestamp(getPublishedAt(a));

                if (publishedDiff) {
                    return publishedDiff;
                }

                return compareVersionsDescending(getField(a, "version"), getField(b, "version"));
            });
            const versions = sortedEntries
                .map((entry) => getField(entry, "version"))
                .filter(Boolean)
                .sort(compareVersionsDescending);

            return {
                seriesKey,
                entries: sortedEntries,
                latestVersion: versions[0] || seriesKey,
            };
        })
        .sort((a, b) => compareVersionsDescending(a.latestVersion, b.latestVersion));
}

function createReleaseSummaryItem(release) {
    const item = document.createElement("li");
    item.className = "release-summary-item";
    item.textContent = String(getUserSummary(release) || getField(release, "title") || getField(release, "version") || "").trim();
    return item;
}

function createSectionHeader(section, isOpen) {
    const header = createButton("release-section-header", "");
    header.setAttribute("aria-expanded", String(isOpen));

    const copy = createElement("span", "release-section-title-group");
    copy.append(createElement("span", "release-section-title", section.latestVersion));
    copy.append(createElement("span", "release-section-subtitle", section.seriesKey));

    const countText = `${section.entries.length} ${section.entries.length === 1 ? "release" : "releases"}`;
    const meta = createElement("span", "release-section-meta");
    meta.append(createElement("span", "release-count", countText));
    meta.append(createElement("span", "release-chevron", ""));

    header.append(copy, meta);
    return header;
}

function setSectionOpen(sectionElement, isOpen) {
    const seriesKey = sectionElement.dataset.seriesKey;
    const header = sectionElement.querySelector(".release-section-header");

    sectionElement.classList.toggle("is-collapsed", !isOpen);

    if (header) {
        header.setAttribute("aria-expanded", String(isOpen));
    }

    if (seriesKey) {
        setStoredSectionState(seriesKey, isOpen);
    }
}

function createReleaseSection(section, isNewestSection) {
    const isOpen = getStoredSectionState(section.seriesKey, isNewestSection);
    const sectionElement = document.createElement("article");
    sectionElement.className = "release-section";
    sectionElement.dataset.seriesKey = section.seriesKey;

    if (!isOpen) {
        sectionElement.classList.add("is-collapsed");
    }

    const header = createSectionHeader(section, isOpen);
    const content = createElement("ul", "release-section-content");

    section.entries.forEach((release) => {
        const item = createReleaseSummaryItem(release);
        item.dataset.filterMatch = "true";
        item.dataset.releaseTokens = Array.from(getReleaseTokens(release)).join(" ");
        item.dataset.version = String(getField(release, "version") || "");
        content.append(item);
    });

    header.addEventListener("click", () => {
        setSectionOpen(sectionElement, sectionElement.classList.contains("is-collapsed"));
    });

    sectionElement.append(header, content);
    return sectionElement;
}

function createFilterControls() {
    if (!changelogControls) {
        return;
    }

    changelogControls.replaceChildren();

    const filterRow = createElement("div", "release-filter-row");

    FILTERS.forEach((filter) => {
        const button = createButton("release-filter-chip", filter.label);
        button.dataset.filter = filter.key;
        button.setAttribute("aria-pressed", String(filter.key === changelogState.activeFilter));

        if (filter.key === changelogState.activeFilter) {
            button.classList.add("is-active");
        }

        button.addEventListener("click", () => applyFilter(filter.key));
        filterRow.append(button);
    });

    const sectionActions = createElement("div", "release-section-actions");
    const expandAll = createButton("release-action-button", "Expand all");
    const collapseAll = createButton("release-action-button", "Collapse all");

    expandAll.addEventListener("click", () => setAllSectionsOpen(true));
    collapseAll.addEventListener("click", () => setAllSectionsOpen(false));

    sectionActions.append(expandAll, collapseAll);
    changelogControls.append(filterRow, sectionActions);
}

function updateFilterControls() {
    if (!changelogControls) {
        return;
    }

    changelogControls.querySelectorAll("[data-filter]").forEach((button) => {
        const isActive = button.dataset.filter === changelogState.activeFilter;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
    });
}

function setAllSectionsOpen(isOpen) {
    changelogState.sections.forEach((section) => {
        setSectionOpen(section.element, isOpen);
    });
}

function showNoFilterMatches() {
    if (!releaseList || releaseList.querySelector("[data-filter-empty]")) {
        return;
    }

    const state = createElement("div", "release-state release-filter-empty");
    state.dataset.filterEmpty = "true";
    state.append(createElement("p", "", "No releases match this filter"));

    const clear = createButton("release-state-action", "Clear filter");
    clear.addEventListener("click", () => applyFilter("all"));
    state.append(clear);

    releaseList.append(state);
}

function hideNoFilterMatches() {
    const state = releaseList && releaseList.querySelector("[data-filter-empty]");

    if (state) {
        state.remove();
    }
}

function applyFilter(filterKey) {
    changelogState.activeFilter = filterKey;
    updateFilterControls();

    let visibleSections = 0;

    changelogState.sections.forEach((section) => {
        let visibleEntries = 0;

        section.entries.forEach((entry) => {
            const isMatch = releaseMatchesFilter(entry.release, filterKey);
            entry.element.classList.toggle("is-filtered-out", !isMatch);

            if (isMatch) {
                visibleEntries += 1;
            }
        });

        section.element.classList.toggle("is-filtered-out", visibleEntries === 0);

        if (visibleEntries > 0) {
            visibleSections += 1;
        }
    });

    if (filterKey !== "all" && visibleSections === 0) {
        showNoFilterMatches();
    } else {
        hideNoFilterMatches();
    }
}

function renderReleases(releases) {
    if (!releaseList) {
        return;
    }

    releaseList.replaceChildren();
    changelogState.sections = [];

    if (!Array.isArray(releases) || !releases.length) {
        if (changelogControls) {
            changelogControls.replaceChildren();
        }

        releaseList.append(createReleaseState("No releases yet", "empty"));
        return;
    }

    createFilterControls();

    buildReleaseGroups(releases).forEach((section, index) => {
        const element = createReleaseSection(section, index === 0);
        const items = Array.from(element.querySelectorAll(".release-summary-item"));

        changelogState.sections.push({
            key: section.seriesKey,
            element,
            entries: section.entries.map((release, entryIndex) => ({
                release,
                element: items[entryIndex],
            })),
        });

        releaseList.append(element);
    });

    observeRevealItem(releaseList);
    applyFilter(changelogState.activeFilter);
}

async function loadSomeryReleases() {
    if (!releaseList) {
        return;
    }

    releaseList.replaceChildren(createReleaseState("Loading Somery releases...", "empty"));

    try {
        const response = await fetch(RELEASES_JSON_URL, {
            headers: {
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(`Releases JSON returned ${response.status}`);
        }

        const payload = await response.json();
        renderReleases(normalizeReleasesPayload(payload));
    } catch (error) {
        if (changelogControls) {
            changelogControls.replaceChildren();
        }

        releaseList.replaceChildren(
            createReleaseState("Somery release notes are temporarily unavailable.", "error")
        );
    }
}

loadSomeryReleases();
