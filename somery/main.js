const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelector(".nav-links");

// Public Supabase Storage object URL. No anon key is required for this JSON file.
const RELEASES_JSON_URL = "https://psjnupcbpjswihsrnoyu.supabase.co/storage/v1/object/public/public-assets/releases.json";
const SECTION_STATE_PREFIX = "somery.changelog.section.";
const RELEASE_CATEGORIES = [
    {
        key: "features",
        title: "New Features & Major Improvements",
        tokens: ["feature", "features", "minor", "major"],
    },
    {
        key: "improvements",
        title: "Enhancements & UX Improvements",
        tokens: ["improvement", "improvements", "enhancement", "enhancements"],
    },
    {
        key: "fixes",
        title: "Fixes",
        tokens: ["fix", "fixes", "bug-fix", "bugfix"],
    },
    {
        key: "performance",
        title: "Performance",
        tokens: ["performance", "perf"],
    },
    {
        key: "maintenance",
        title: "Maintenance",
        tokens: ["maintenance", "maint", "chore", "chores"],
    },
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
const releaseVersionList = document.querySelector("[data-release-versions]");
let revealObserver = null;
let changelogState = {
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

function releaseMatchesCategory(release, category) {
    const tokens = getReleaseTokens(release);
    return category.tokens.some((token) => tokens.has(token));
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
            const latestVersion = versions[0] || seriesKey;
            const latestEntry = sortedEntries.find((entry) => getField(entry, "version") === latestVersion) || sortedEntries[0];

            return {
                seriesKey,
                entries: sortedEntries,
                latestVersion,
                latestDate: formatDate(getMergedAt(latestEntry) || getPublishedAt(latestEntry)),
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

function getReleaseCategory(release) {
    return RELEASE_CATEGORIES.find((category) => releaseMatchesCategory(release, category))
        || RELEASE_CATEGORIES[RELEASE_CATEGORIES.length - 1];
}

function createCategoryBlock(category, releases) {
    const block = createElement("section", "release-category");
    block.append(createElement("h3", "release-category-title", category.title));

    const list = createElement("ul", "release-category-list");
    releases.forEach((release) => list.append(createReleaseSummaryItem(release)));
    block.append(list);

    return block;
}

function createSectionHeader(section, isOpen) {
    const header = createButton("release-section-header", "");
    header.setAttribute("aria-expanded", String(isOpen));

    const copy = createElement("span", "release-section-title-group");
    copy.append(createElement("span", "release-section-title", section.latestVersion));

    const meta = createElement("span", "release-section-meta");

    if (section.latestDate) {
        copy.append(createElement("span", "release-section-subtitle", section.latestDate));
    }

    meta.append(createElement("span", "release-count", section.seriesKey));
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
    const content = createElement("div", "release-section-content");
    const entriesByCategory = new Map();

    RELEASE_CATEGORIES.forEach((category) => entriesByCategory.set(category.key, []));

    section.entries.forEach((release) => {
        const category = getReleaseCategory(release);
        entriesByCategory.get(category.key).push(release);
    });

    RELEASE_CATEGORIES.forEach((category) => {
        const releases = entriesByCategory.get(category.key);

        if (releases.length) {
            content.append(createCategoryBlock(category, releases));
        }
    });

    header.addEventListener("click", () => {
        setSectionOpen(sectionElement, sectionElement.classList.contains("is-collapsed"));
        setActiveVersion(section.seriesKey);
    });

    sectionElement.append(header, content);
    return sectionElement;
}

function setActiveVersion(seriesKey) {
    if (!releaseVersionList) {
        return;
    }

    releaseVersionList.querySelectorAll("[data-series-key]").forEach((button) => {
        const isActive = button.dataset.seriesKey === seriesKey;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-current", isActive ? "true" : "false");
    });
}

function createVersionNavItem(section, isActive) {
    const button = createButton("release-version-item", "");
    button.dataset.seriesKey = section.seriesKey;
    button.setAttribute("aria-current", isActive ? "true" : "false");

    if (isActive) {
        button.classList.add("is-active");
    }

    button.append(createElement("span", "release-version-name", section.latestVersion));

    if (section.latestDate) {
        button.append(createElement("span", "release-version-date", section.latestDate));
    }

    button.addEventListener("click", () => {
        const sectionState = changelogState.sections.find((item) => item.key === section.seriesKey);

        if (sectionState) {
            setSectionOpen(sectionState.element, true);
            setActiveVersion(section.seriesKey);
            sectionState.element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    });

    return button;
}

function renderReleases(releases) {
    if (!releaseList) {
        return;
    }

    releaseList.replaceChildren();
    changelogState.sections = [];

    if (releaseVersionList) {
        releaseVersionList.replaceChildren();
    }

    if (!Array.isArray(releases) || !releases.length) {
        if (releaseVersionList) {
            releaseVersionList.append(createReleaseState("No versions yet", "empty"));
        }

        releaseList.append(createReleaseState("No releases yet", "empty"));
        return;
    }

    const groups = buildReleaseGroups(releases);

    if (releaseVersionList) {
        groups.forEach((section, index) => {
            releaseVersionList.append(createVersionNavItem(section, index === 0));
        });
    }

    groups.forEach((section, index) => {
        const element = createReleaseSection(section, index === 0);

        changelogState.sections.push({
            key: section.seriesKey,
            element,
        });

        releaseList.append(element);
    });

    observeRevealItem(releaseList);
}

async function loadSomeryReleases() {
    if (!releaseList) {
        return;
    }

    releaseList.replaceChildren(createReleaseState("Loading Somery releases...", "empty"));

    if (releaseVersionList) {
        releaseVersionList.replaceChildren(createReleaseState("Loading versions...", "empty"));
    }

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
        if (releaseVersionList) {
            releaseVersionList.replaceChildren(createReleaseState("Versions unavailable.", "error"));
        }

        releaseList.replaceChildren(
            createReleaseState("Somery release notes are temporarily unavailable.", "error")
        );
    }
}

loadSomeryReleases();
