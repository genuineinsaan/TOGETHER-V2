
"use strict";

/* =========================================
   TOGETHER ❤️ — MAIN APPLICATION
========================================= */

const DEFAULT_START_DATE = "2026-10-27";
const HISTORY_SEED_KEY = "together-32-days-seeded";

const STORAGE_KEYS = {
    savings: "together-savings-data",
    withdrawals: "together-withdrawals-data",
    account: "together-account-profile",
    theme: "together-theme",
    reminder: "together-reminder-enabled",
    milestones: "together-milestone-notifications",
    lastReminder: "together-last-reminder-date",
    notifiedMilestones: "together-notified-milestones"
};

let SAVINGS_START_DATE =
    localStorage.getItem("together-savings-start-date") ||
    DEFAULT_START_DATE;

let savingsRecords = {};
let withdrawalRecords = [];

let accountProfile = {
    personOneName: "",
    personTwoName: "",
    personOnePhoto: "",
    personTwoPhoto: ""
};

let currentTheme = localStorage.getItem(STORAGE_KEYS.theme) || "system";
let deferredInstallPrompt = null;
let serviceWorkerRegistration = null;

let journeyChart = null;
let reportChart = null;
let barChart = null;
let pieChart = null;

let selectedPreviousDate = null;

const MILESTONE_LEVELS = [
    100, 500, 1000, 2500, 5000, 10000,
    25000, 50000, 100000
];

/* =========================================
   1. COMMON HELPERS
========================================= */

function formatMoney(amount) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(Number(amount) || 0);
}

function formatNumber(amount) {
    return new Intl.NumberFormat("en-IN", {
        maximumFractionDigits: 2
    }).format(Number(amount) || 0);
}

function formatLocalDate(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
}

function parseLocalDate(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function getTodayKey() {
    return formatLocalDate(new Date());
}

function getDayDifference(start, end) {
    const a = Date.UTC(
        start.getFullYear(),
        start.getMonth(),
        start.getDate()
    );

    const b = Date.UTC(
        end.getFullYear(),
        end.getMonth(),
        end.getDate()
    );

    return Math.floor((b - a) / 86400000);
}

function formatDisplayDate(key) {
    return parseLocalDate(key).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function safeJSONParse(value, fallback) {
    try {
        return value ? JSON.parse(value) : fallback;
    } catch {
        return fallback;
    }
}

function saveToStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error("Storage error:", error);
        alert("Your browser could not save this information. Please check browser storage.");
        return false;
    }
}

function getDateKeysBetween(startKey, endKey) {
    const dates = [];
    const date = parseLocalDate(startKey);
    const end = parseLocalDate(endKey);

    while (date <= end) {
        dates.push(formatLocalDate(date));
        date.setDate(date.getDate() + 1);
    }

    return dates;
}

function getEmptyRecord() {
    return {
        mrSaved: false,
        mrsSaved: false,
        updatedAt: null
    };
}

/* =========================================
   2. NAVIGATION
========================================= */

const pageTitles = {
    dashboard: "Home",
    together: "Together Savings",
    reports: "Reports",
    account: "Our Account",
    settings: "Settings"
};

function switchPage(pageId) {
    const selected = document.getElementById(pageId);

    if (!selected || !selected.classList.contains("page-view")) return;

    document.querySelectorAll(".page-view").forEach(page => {
        page.classList.remove("active");
    });

    selected.classList.add("active");

    setText("page-title", pageTitles[pageId] || "TOGETHER");

    document.querySelectorAll("[data-view]").forEach(button => {
        button.classList.toggle("active", button.dataset.view === pageId);
    });

    document.getElementById("sidebar")?.classList.remove("open");

    sessionStorage.setItem("together-current-page", pageId);

    if (pageId === "dashboard") renderHome();
    if (pageId === "together") renderAllSavings();
    if (pageId === "reports") renderSavingsReport();
}

document.querySelectorAll("[data-view]").forEach(button => {
    button.addEventListener("click", () => {
        switchPage(button.dataset.view);
    });
});

const savedPage = sessionStorage.getItem("together-current-page");

switchPage(
    savedPage && pageTitles[savedPage]
        ? savedPage
        : "dashboard"
);

const sidebar = document.getElementById("sidebar");
const menuToggle = document.getElementById("menu-toggle");

menuToggle?.addEventListener("click", () => {
    sidebar?.classList.toggle("open");
});

document.addEventListener("click", event => {
    if (!sidebar || !menuToggle) return;

    if (
        !sidebar.contains(event.target) &&
        !menuToggle.contains(event.target)
    ) {
        sidebar.classList.remove("open");
    }
});

/* =========================================
   3. THEME
========================================= */

const themeToggle = document.getElementById("theme-toggle");
const themeSelect = document.getElementById("theme-select");

function applyTheme(theme) {
    currentTheme = theme;

    if (theme === "system") {
        document.documentElement.removeAttribute("data-theme");
    } else {
        document.documentElement.setAttribute("data-theme", theme);
    }

    if (themeSelect) {
        themeSelect.value = theme;
    }

    if (themeToggle) {
        themeToggle.textContent =
            theme === "dark" ? "☀" :
            theme === "light" ? "☾" : "◐";
    }

    localStorage.setItem(STORAGE_KEYS.theme, theme);
    renderCharts();
}

themeSelect?.addEventListener("change", () => {
    applyTheme(themeSelect.value);
});

themeToggle?.addEventListener("click", () => {
    const next = {
        system: "dark",
        dark: "light",
        light: "system"
    };

    applyTheme(next[currentTheme] || "system");
});

applyTheme(currentTheme);

/* =========================================
   4. CURRENT DATE
========================================= */

function updateCurrentDate() {
    setText(
        "current-date",
        new Date().toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        })
    );
}

updateCurrentDate();

/* =========================================
   5. SAVINGS DATA & MIGRATION
========================================= */

/*
    New storage format:

    {
        "2026-11-27": {
            mrSaved: true,
            mrsSaved: false,
            updatedAt: "..."
        }
    }

    This preserves separate check-ins for both people.
*/

function loadSavingsData() {
    const saved = safeJSONParse(
        localStorage.getItem(STORAGE_KEYS.savings),
        {}
    );

    savingsRecords = {};

    if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
        return;
    }

    Object.entries(saved).forEach(([dateKey, record]) => {
        if (!record || typeof record !== "object") return;

        // Already using the separate checkbox format.
        if (
            typeof record.mrSaved === "boolean" ||
            typeof record.mrsSaved === "boolean"
        ) {
            savingsRecords[dateKey] = {
                mrSaved: Boolean(record.mrSaved),
                mrsSaved: Boolean(record.mrsSaved),
                updatedAt: record.updatedAt || null
            };
            return;
        }

        /*
            Migrate the previous combined checkbox format.
            A previously completed day is preserved as both saved.
        */
        if (typeof record.checked === "boolean") {
            savingsRecords[dateKey] = {
                mrSaved: record.checked,
                mrsSaved: record.checked,
                updatedAt: record.updatedAt || null
            };
            return;
        }

        /*
            Migrate previous combined amount records.
            An amount greater than zero is preserved as a completed
            combined contribution.
        */
        if (Object.prototype.hasOwnProperty.call(record, "amount")) {
            const completed = Number(record.amount) > 0;

            savingsRecords[dateKey] = {
                mrSaved: completed,
                mrsSaved: completed,
                updatedAt: record.updatedAt || null
            };
        }
    });

    saveSavingsData();
}

function saveSavingsData() {
    return saveToStorage(STORAGE_KEYS.savings, savingsRecords);
}

/*
    Initial historical seed:
    27 October 2026 through 27 November 2026.

    This is only for the initial setup if the user has not already
    had historical data seeded.

    Each previously confirmed completed day is preserved for both
    people. Future days are never automatically marked as saved.
*/

function seedHistoricalSavings() {
    if (localStorage.getItem(HISTORY_SEED_KEY) === "true") return;

    const historicalDates = getDateKeysBetween(
        DEFAULT_START_DATE,
        "2026-11-27"
    );

    historicalDates.forEach(dateKey => {
        if (savingsRecords[dateKey]) return;

        savingsRecords[dateKey] = {
            mrSaved: true,
            mrsSaved: true,
            updatedAt: new Date().toISOString()
        };
    });

    if (saveSavingsData()) {
        localStorage.setItem(HISTORY_SEED_KEY, "true");
    }
}

/* =========================================
   6. SAVINGS CYCLE & CONTRIBUTIONS
========================================= */

function getSavingsDetails(dateKey = getTodayKey()) {
    const date = parseLocalDate(dateKey);
    const start = parseLocalDate(SAVINGS_START_DATE);

    const overallDay = getDayDifference(start, date) + 1;

    if (overallDay < 1) return null;

    const cycleDay = ((overallDay - 1) % 10) + 1;

    return {
        overallDay,
        cycleDay,
        dailyAmount: cycleDay,
        combinedTarget: cycleDay * 2
    };
}

function getDateRecord(dateKey) {
    return savingsRecords[dateKey] || getEmptyRecord();
}

function isMrSaved(dateKey) {
    return getDateRecord(dateKey).mrSaved === true;
}

function isMrsSaved(dateKey) {
    return getDateRecord(dateKey).mrsSaved === true;
}

function isDateFullySaved(dateKey) {
    return isMrSaved(dateKey) && isMrsSaved(dateKey);
}

function isDatePartiallySaved(dateKey) {
    return isMrSaved(dateKey) || isMrsSaved(dateKey);
}

function getPersonContribution(dateKey, person) {
    const details = getSavingsDetails(dateKey);

    if (!details) return 0;

    if (person === "mr") {
        return isMrSaved(dateKey) ? details.dailyAmount : 0;
    }

    if (person === "mrs") {
        return isMrsSaved(dateKey) ? details.dailyAmount : 0;
    }

    return 0;
}

function getRecordedContribution(dateKey) {
    return (
        getPersonContribution(dateKey, "mr") +
        getPersonContribution(dateKey, "mrs")
    );
}

function getTotalMrContributions() {
    return Object.keys(savingsRecords).reduce((total, dateKey) => {
        return total + getPersonContribution(dateKey, "mr");
    }, 0);
}

function getTotalMrsContributions() {
    return Object.keys(savingsRecords).reduce((total, dateKey) => {
        return total + getPersonContribution(dateKey, "mrs");
    }, 0);
}

function getTotalContributions() {
    return getTotalMrContributions() + getTotalMrsContributions();
}

/* =========================================
   7. CHECK-IN HELPERS
========================================= */

function updateDateRecord(dateKey, person, checked) {
    const existing = getDateRecord(dateKey);

    const updated = {
        mrSaved: existing.mrSaved,
        mrsSaved: existing.mrsSaved,
        updatedAt: new Date().toISOString()
    };

    if (person === "mr") {
        updated.mrSaved = checked;
    } else if (person === "mrs") {
        updated.mrsSaved = checked;
    }

    savingsRecords[dateKey] = updated;

    if (!saveSavingsData()) {
        savingsRecords[dateKey] = existing;
        return false;
    }

    return true;
}

function getPersonNames() {
    return {
        mr: accountProfile.personOneName || "Mr.",
        mrs: accountProfile.personTwoName || "Mrs."
    };
}

function getCheckinStatus(dateKey) {
    const mr = isMrSaved(dateKey);
    const mrs = isMrsSaved(dateKey);

    if (mr && mrs) return "Both saved";
    if (mr) return "Mr. saved";
    if (mrs) return "Mrs. saved";

    return "Not saved";
}

/* =========================================
   8. TODAY'S CHECK-IN
========================================= */

const mrTodayCheckbox = document.getElementById("mr-today-checkbox");
const mrsTodayCheckbox = document.getElementById("mrs-today-checkbox");

function renderTodayCheckin() {
    const today = getTodayKey();
    const details = getSavingsDetails(today);

    if (!details) {
        setText("daily-target", "—");
        setText("cycle-day", "Not started");
        setText("today-cycle-day", "Not started");

        if (mrTodayCheckbox) mrTodayCheckbox.checked = false;
        if (mrsTodayCheckbox) mrsTodayCheckbox.checked = false;

        setText("today-recorded", formatMoney(0));
        setText("today-combined-contribution", `${formatMoney(0)} / ${formatMoney(0)}`);
        setText("today-checkin-status", "Your savings journey has not started yet.");
        return;
    }

    const mrSaved = isMrSaved(today);
    const mrsSaved = isMrsSaved(today);

    const mrAmount = getPersonContribution(today, "mr");
    const mrsAmount = getPersonContribution(today, "mrs");
    const combined = mrAmount + mrsAmount;

    if (mrTodayCheckbox) {
        mrTodayCheckbox.checked = mrSaved;
    }

    if (mrsTodayCheckbox) {
        mrsTodayCheckbox.checked = mrsSaved;
    }

    const names = getPersonNames();

    setText("mr-checkin-name", names.mr);
    setText("mrs-checkin-name", names.mrs);

    setText("mr-checkin-amount", `Today's amount: ${formatMoney(details.dailyAmount)}`);
    setText("mrs-checkin-amount", `Today's amount: ${formatMoney(details.dailyAmount)}`);

    setText("daily-target", formatMoney(details.combinedTarget));
    setText("cycle-day", `Day ${details.cycleDay} / 10`);
    setText("today-cycle-day", `Cycle Day ${details.cycleDay}`);

    setText("today-recorded", formatMoney(combined));
    setText(
        "today-combined-contribution",
        `${formatMoney(combined)} / ${formatMoney(details.combinedTarget)}`
    );

    let status = "Not completed";

    if (mrSaved && mrsSaved) {
        status = "Both saved ♥";
    } else if (mrSaved || mrsSaved) {
        status = "Partially saved";
    }

    setText("today-checkin-status", status);
}

function handleTodayCheckbox(person, checked) {
    const today = getTodayKey();
    const details = getSavingsDetails(today);

    if (!details) return;

    if (!updateDateRecord(today, person, checked)) {
        renderTodayCheckin();
        return;
    }

    setText(
        "checkin-form-status",
        checked
            ? `${person === "mr" ? getPersonNames().mr : getPersonNames().mrs} check-in saved. ♥`
            : "Check-in updated."
    );

    renderAllSavings();
    checkMilestoneNotifications();
}

mrTodayCheckbox?.addEventListener("change", () => {
    handleTodayCheckbox("mr", mrTodayCheckbox.checked);
});

mrsTodayCheckbox?.addEventListener("change", () => {
    handleTodayCheckbox("mrs", mrsTodayCheckbox.checked);
});

/* =========================================
   9. UPDATE PREVIOUS CONTRIBUTION
========================================= */

const previousDateInput = document.getElementById("previous-contribution-date");
const loadPreviousDateButton = document.getElementById("load-previous-date-button");
const previousEditor = document.getElementById("previous-date-checkin-editor");

const mrPreviousCheckbox = document.getElementById("mr-previous-checkbox");
const mrsPreviousCheckbox = document.getElementById("mrs-previous-checkbox");

function renderPreviousDateEditor(dateKey) {
    const details = getSavingsDetails(dateKey);

    if (!details || dateKey < SAVINGS_START_DATE || dateKey >= getTodayKey()) {
        setText("previous-date-status", "Please select a valid previous date.");
        if (previousEditor) previousEditor.hidden = true;
        selectedPreviousDate = null;
        return;
    }

    selectedPreviousDate = dateKey;

    if (previousEditor) previousEditor.hidden = false;

    const names = getPersonNames();

    setText("previous-date-title", formatDisplayDate(dateKey));
    setText(
        "previous-date-cycle-info",
        `Day ${details.overallDay} · Cycle Day ${details.cycleDay}`
    );

    setText("mr-previous-name", names.mr);
    setText("mrs-previous-name", names.mrs);

    setText(
        "mr-previous-amount",
        `Contribution: ${formatMoney(details.dailyAmount)}`
    );

    setText(
        "mrs-previous-amount",
        `Contribution: ${formatMoney(details.dailyAmount)}`
    );

    if (mrPreviousCheckbox) {
        mrPreviousCheckbox.checked = isMrSaved(dateKey);
    }

    if (mrsPreviousCheckbox) {
        mrsPreviousCheckbox.checked = isMrsSaved(dateKey);
    }

    renderPreviousDateSummary(dateKey);

    setText(
        "previous-date-status",
        "You are editing the selected date's savings records."
    );
}

function renderPreviousDateSummary(dateKey) {
    const details = getSavingsDetails(dateKey);
    if (!details) return;

    const total = getRecordedContribution(dateKey);

    setText(
        "previous-combined-contribution",
        `${formatMoney(total)} / ${formatMoney(details.combinedTarget)}`
    );

    setText(
        "previous-checkin-status",
        getCheckinStatus(dateKey)
    );
}

function loadPreviousDate() {
    const dateKey = previousDateInput?.value;

    if (!dateKey) {
        setText("previous-date-status", "Please choose a date first.");
        return;
    }

    renderPreviousDateEditor(dateKey);
}

loadPreviousDateButton?.addEventListener("click", loadPreviousDate);

previousDateInput?.addEventListener("change", () => {
    if (previousDateInput.value) {
        loadPreviousDate();
    }
});

function handlePreviousCheckbox(person, checked) {
    if (!selectedPreviousDate) return;

    const dateKey = selectedPreviousDate;

    if (!updateDateRecord(dateKey, person, checked)) {
        renderPreviousDateEditor(dateKey);
        return;
    }

    renderAllSavings();

    // Keep the selected past date open after the update.
    renderPreviousDateEditor(dateKey);

    setText(
        "previous-date-status",
        `Updated ${formatDisplayDate(dateKey)} successfully. ♥`
    );

    checkMilestoneNotifications();
}

mrPreviousCheckbox?.addEventListener("change", () => {
    handlePreviousCheckbox("mr", mrPreviousCheckbox.checked);
});

mrsPreviousCheckbox?.addEventListener("change", () => {
    handlePreviousCheckbox("mrs", mrsPreviousCheckbox.checked);
});

/* =========================================
   10. WITHDRAWALS
========================================= */

function loadWithdrawals() {
    const saved = safeJSONParse(
        localStorage.getItem(STORAGE_KEYS.withdrawals),
        []
    );

    withdrawalRecords = Array.isArray(saved)
        ? saved.filter(item => item && typeof item === "object")
        : [];
}

function saveWithdrawals() {
    return saveToStorage(STORAGE_KEYS.withdrawals, withdrawalRecords);
}

function getTotalWithdrawals() {
    return withdrawalRecords.reduce((total, item) => {
        return total + Math.max(0, Number(item.amount) || 0);
    }, 0);
}

function getAvailableSavings() {
    return getTotalContributions() - getTotalWithdrawals();
}

const withdrawalForm = document.getElementById("withdrawal-form");

withdrawalForm?.addEventListener("submit", event => {
    event.preventDefault();

    const dateKey = document.getElementById("withdrawal-date").value;
    const amount = Number(document.getElementById("withdrawal-amount").value);
    const reason = document.getElementById("withdrawal-reason").value.trim();
    const status = document.getElementById("withdrawal-form-status");

    if (!dateKey || dateKey < SAVINGS_START_DATE || dateKey > getTodayKey()) {
        status.textContent = "Please select a valid withdrawal date.";
        return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
        status.textContent = "Please enter a valid amount.";
        return;
    }

    if (amount > getAvailableSavings()) {
        status.textContent = "This amount is greater than your available savings.";
        return;
    }

    withdrawalRecords.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        date: dateKey,
        amount,
        reason,
        createdAt: new Date().toISOString()
    });

    if (!saveWithdrawals()) {
        withdrawalRecords.pop();
        return;
    }

    withdrawalForm.reset();

    document.getElementById("withdrawal-date").value = getTodayKey();
    document.getElementById("withdrawal-date").max = getTodayKey();

    status.textContent = "Withdrawal recorded successfully. ♥";

    renderAllSavings();
});

function deleteWithdrawal(id) {
    const index = withdrawalRecords.findIndex(item => item.id === id);
    if (index < 0) return;

    if (!confirm("Delete this withdrawal record?")) return;

    withdrawalRecords.splice(index, 1);

    if (!saveWithdrawals()) return;

    renderAllSavings();
}

function renderWithdrawalHistory() {
    const container = document.getElementById("withdrawal-history");
    if (!container) return;

    container.innerHTML = "";

    const sorted = [...withdrawalRecords].sort((a, b) =>
        b.date.localeCompare(a.date)
    );

    if (!sorted.length) {
        container.innerHTML =
            '<p class="empty-state">No withdrawals recorded.</p>';
        return;
    }

    sorted.forEach(item => {
        const row = document.createElement("div");
        row.className = "history-row";

        const info = document.createElement("div");
        info.className = "history-row-info";

        const date = document.createElement("strong");
        date.textContent = formatDisplayDate(item.date);

        const reason = document.createElement("small");
        reason.textContent = item.reason || "Withdrawal";

        info.append(date, reason);

        const amount = document.createElement("strong");
        amount.className = "history-amount negative";
        amount.textContent = `− ${formatMoney(item.amount)}`;

        const actions = document.createElement("div");
        actions.className = "history-actions";

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "small-action-button danger-action";
        remove.textContent = "Delete";

        remove.addEventListener("click", () => {
            deleteWithdrawal(item.id);
        });

        actions.appendChild(remove);
        row.append(info, amount, actions);
        container.appendChild(row);
    });
}

/* =========================================
   11. DAILY SAVINGS HISTORY
========================================= */

/*
    IMPORTANT:
    This is the daily contribution HISTORY, not the
    old long list of checkboxes.

    Each date displays:
    - Date
    - Day and cycle
    - Mr's contribution
    - Mrs's contribution
    - Combined amount
    - Whether the day is complete or partial
*/

function renderSavingsHistory() {
    const container = document.getElementById("savings-history");
    if (!container) return;

    container.innerHTML = "";

    const dates = Object.keys(savingsRecords)
        .filter(dateKey =>
            dateKey >= SAVINGS_START_DATE &&
            dateKey <= getTodayKey() &&
            isDatePartiallySaved(dateKey)
        )
        .sort()
        .reverse();

    if (!dates.length) {
        container.innerHTML =
            '<p class="empty-state">No savings check-ins recorded yet.</p>';
        return;
    }

    const names = getPersonNames();

    dates.forEach(dateKey => {
        const details = getSavingsDetails(dateKey);
        if (!details) return;

        const mrAmount = getPersonContribution(dateKey, "mr");
        const mrsAmount = getPersonContribution(dateKey, "mrs");
        const total = mrAmount + mrsAmount;

        const row = document.createElement("div");
        row.className = "history-row savings-history-row";

        const info = document.createElement("div");
        info.className = "history-row-info";

        const date = document.createElement("strong");
        date.textContent = formatDisplayDate(dateKey);

        const cycle = document.createElement("small");
        cycle.textContent =
            `Day ${details.overallDay} · Cycle Day ${details.cycleDay}`;

        const people = document.createElement("small");
        people.textContent =
            `${names.mr}: ${formatMoney(mrAmount)} · ${names.mrs}: ${formatMoney(mrsAmount)}`;

        info.append(date, cycle, people);

        const amountArea = document.createElement("div");
        amountArea.className = "history-row-info";

        const amount = document.createElement("strong");
        amount.className = "history-amount positive";
        amount.textContent = `+ ${formatMoney(total)}`;

        const status = document.createElement("small");
        status.textContent = isDateFullySaved(dateKey)
            ? "Both saved"
            : "Partial contribution";

        amountArea.append(amount, status);

        row.append(info, amountArea);
        container.appendChild(row);
    });
}

/* =========================================
   12. SAVINGS TOTALS
========================================= */

function renderSavingsTotals() {
    const mrTotal = getTotalMrContributions();
    const mrsTotal = getTotalMrsContributions();

    const contributions = mrTotal + mrsTotal;
    const withdrawals = getTotalWithdrawals();
    const available = contributions - withdrawals;

    setText("together-total-contributions", formatMoney(contributions));
    setText("together-total-withdrawals", formatMoney(withdrawals));
    setText("available-savings", formatMoney(available));
    setText("home-together-balance", formatMoney(available));
    setText("total-contributions", formatMoney(contributions));
}

/* =========================================
   13. STREAK & HOME HIGHLIGHTS
========================================= */

function getCurrentSavingsDay() {
    return getDayDifference(
        parseLocalDate(SAVINGS_START_DATE),
        parseLocalDate(getTodayKey())
    ) + 1;
}

function getSavingsStreak() {
    let date = parseLocalDate(getTodayKey());

    // If today's full check-in is incomplete, count from yesterday.
    if (!isDateFullySaved(formatLocalDate(date))) {
        date.setDate(date.getDate() - 1);
    }

    let streak = 0;

    while (formatLocalDate(date) >= SAVINGS_START_DATE) {
        if (!isDateFullySaved(formatLocalDate(date))) break;

        streak++;
        date.setDate(date.getDate() - 1);
    }

    return streak;
}

function getNextMilestone(balance) {
    return MILESTONE_LEVELS.find(level => level > balance) ||
        Math.ceil((balance + 1) / 10000) * 10000;
}

function renderHomeHighlights() {
    const balance = getAvailableSavings();
    const days = Math.max(0, getCurrentSavingsDay());
    const next = getNextMilestone(balance);
    const remaining = Math.max(0, next - balance);
    const streak = getSavingsStreak();

    setText("days-since-start", days);
    setText("next-milestone", formatMoney(next));

    setText(
        "milestone-remaining",
        `${formatMoney(remaining)} to go`
    );

    setText(
        "current-streak",
        `${streak} ${streak === 1 ? "day" : "days"}`
    );

    setText(
        "streak-caption",
        streak > 0
            ? "Your saving rhythm is growing. ♥"
            : "Complete both check-ins to begin a streak."
    );

    setText("savings-start-date", formatDisplayDate(SAVINGS_START_DATE));

    const accountDate = document.getElementById("account-savings-start-date");
    if (accountDate) accountDate.value = SAVINGS_START_DATE;
}

/* =========================================
   14. SINGLE MILESTONE RING
========================================= */

function renderMilestoneRings() {
    const container = document.getElementById("milestone-rings");
    if (!container) return;

    container.innerHTML = "";

    const balance = Math.max(0, getAvailableSavings());
    const target = getNextMilestone(balance);

    const previous = MILESTONE_LEVELS
        .filter(level => level < target)
        .pop() || 0;

    const progress = Math.min(
        100,
        Math.max(0, ((balance - previous) / (target - previous)) * 100)
    );

    const card = document.createElement("div");
    card.className = "milestone-item single-milestone";

    const ring = document.createElement("div");
    ring.className = "milestone-ring";
    ring.style.setProperty("--ring-progress", `${progress}%`);

    const inner = document.createElement("div");
    inner.className = "milestone-ring-inner";
    inner.textContent = `${Math.round(progress)}%`;

    ring.appendChild(inner);

    const title = document.createElement("strong");
    title.textContent =
        `${formatMoney(balance)} / ${formatMoney(target)}`;

    const caption = document.createElement("small");
    caption.textContent =
        `${formatMoney(Math.max(0, target - balance))} left to reach our next goal`;

    card.append(ring, title, caption);
    container.appendChild(card);
}

/* =========================================
   15. CHART DATA
========================================= */

function getSavingsGrowthData() {
    const today = getTodayKey();

    const dates = getDateKeysBetween(
        SAVINGS_START_DATE,
        today
    );

    let runningBalance = 0;

    const labels = [];
    const balances = [];

    dates.forEach(dateKey => {
        runningBalance += getRecordedContribution(dateKey);

        withdrawalRecords.forEach(item => {
            if (item.date === dateKey) {
                runningBalance -= Number(item.amount) || 0;
            }
        });

        labels.push(
            parseLocalDate(dateKey).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short"
            })
        );

        balances.push(Math.max(0, runningBalance));
    });

    return { labels, balances };
}

function getChartColours() {
    const styles = getComputedStyle(document.documentElement);

    return {
        text: styles.getPropertyValue("--text").trim() || "#f5f3f8",
        muted: styles.getPropertyValue("--muted").trim() || "#9998a9",
        accent: styles.getPropertyValue("--accent").trim() || "#a58be8",
        border: styles.getPropertyValue("--border").trim() ||
            "rgba(255,255,255,.1)"
    };
}

function chartOptions(colours) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: { color: colours.text }
            }
        },
        scales: {
            x: {
                grid: { display: false },
                ticks: {
                    color: colours.muted,
                    maxTicksLimit: 8
                }
            },
            y: {
                beginAtZero: true,
                grid: { color: colours.border },
                ticks: {
                    color: colours.muted,
                    callback: value => `₹${formatNumber(value)}`
                }
            }
        }
    };
}

function destroyChart(chart) {
    if (chart) chart.destroy();
}

function renderJourneyChart() {
    const canvas = document.getElementById("journey-chart");

    if (!canvas || typeof Chart === "undefined") return;

    destroyChart(journeyChart);

    const data = getSavingsGrowthData();
    const colours = getChartColours();

    const context = canvas.getContext("2d");
    const gradient = context.createLinearGradient(0, 0, 0, 260);

    gradient.addColorStop(0, "rgba(145,105,235,0.35)");
    gradient.addColorStop(1, "rgba(145,105,235,0.01)");

    journeyChart = new Chart(canvas, {
        type: "line",
        data: {
            labels: data.labels,
            datasets: [{
                label: "Available savings",
                data: data.balances,
                borderColor: colours.accent,
                backgroundColor: gradient,
                fill: true,
                tension: 0.35,
                borderWidth: 3,
                pointRadius: data.labels.length > 24 ? 0 : 3
            }]
        },
        options: {
            ...chartOptions(colours),
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: context => formatMoney(context.parsed.y)
                    }
                }
            }
        }
    });
}

function renderSavingsReport() {
    if (typeof Chart === "undefined") return;

    const colours = getChartColours();
    const growth = getSavingsGrowthData();

    const lineCanvas = document.getElementById("savings-chart");

    if (lineCanvas) {
        destroyChart(reportChart);

        reportChart = new Chart(lineCanvas, {
            type: "line",
            data: {
                labels: growth.labels,
                datasets: [{
                    label: "Available savings",
                    data: growth.balances,
                    borderColor: colours.accent,
                    backgroundColor: "rgba(145,105,235,0.15)",
                    fill: true,
                    tension: 0.35
                }]
            },
            options: chartOptions(colours)
        });
    }

    const barCanvas = document.getElementById("savings-bar-chart");

    if (barCanvas) {
        destroyChart(barChart);

        const dates = getDateKeysBetween(
            SAVINGS_START_DATE,
            getTodayKey()
        );

        const dailyAmounts = dates.map(date =>
            getRecordedContribution(date)
        );

        const labels = dates.map(date =>
            parseLocalDate(date).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short"
            })
        );

        barChart = new Chart(barCanvas, {
            type: "bar",
            data: {
                labels,
                datasets: [{
                    label: "Daily contributions",
                    data: dailyAmounts,
                    backgroundColor: "rgba(145,105,235,0.7)",
                    borderRadius: 6
                }]
            },
            options: chartOptions(colours)
        });
    }

    const pieCanvas = document.getElementById("savings-pie-chart");

    if (pieCanvas) {
        destroyChart(pieChart);

        pieChart = new Chart(pieCanvas, {
            type: "doughnut",
            data: {
                labels: ["Contributions", "Withdrawals"],
                datasets: [{
                    data: [
                        getTotalContributions(),
                        getTotalWithdrawals()
                    ],
                    backgroundColor: [
                        "#8b6de9",
                        "#25bfa1",
                        "#39a7e8",
                        "#edb84b",
                        "#ef7b9e"
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: "bottom",
                        labels: { color: colours.text }
                    }
                }
            }
        });
    }
}

function renderCharts() {
    if (
        document.getElementById("dashboard")?.classList.contains("active")
    ) {
        renderJourneyChart();
    }

    if (
        document.getElementById("reports")?.classList.contains("active")
    ) {
        renderSavingsReport();
    }
}

/* =========================================
   16. RENDER EVERYTHING
========================================= */

function renderHome() {
    renderSavingsTotals();
    renderHomeHighlights();
    renderMilestoneRings();
    renderJourneyChart();
}

function renderAllSavings() {
    renderSavingsTotals();
    renderTodayCheckin();
    renderSavingsHistory();
    renderWithdrawalHistory();
    renderHomeHighlights();
    renderMilestoneRings();
    renderCharts();

    // Keep the selected previous date editor in sync.
    if (selectedPreviousDate) {
        renderPreviousDateEditor(selectedPreviousDate);
    }
}

/* =========================================
   17. ACCOUNT PROFILE
========================================= */

function loadAccountProfile() {
    const saved = safeJSONParse(
        localStorage.getItem(STORAGE_KEYS.account),
        {}
    );

    accountProfile = {
        personOneName: saved.personOneName || "",
        personTwoName: saved.personTwoName || "",
        personOnePhoto: saved.personOnePhoto || "",
        personTwoPhoto: saved.personTwoPhoto || ""
    };

    const oneName = document.getElementById("person-one-name");
    const twoName = document.getElementById("person-two-name");

    if (oneName) oneName.value = accountProfile.personOneName;
    if (twoName) twoName.value = accountProfile.personTwoName;

    updateProfilePhoto("one", accountProfile.personOnePhoto);
    updateProfilePhoto("two", accountProfile.personTwoPhoto);

    setText("mr-checkin-name", accountProfile.personOneName || "Mr.");
    setText("mrs-checkin-name", accountProfile.personTwoName || "Mrs.");
}

function updateProfilePhoto(person, photo) {
    const preview = document.getElementById(
        `person-${person}-photo-preview`
    );

    const placeholder = document.getElementById(
        `person-${person}-photo-placeholder`
    );

    if (!preview || !placeholder) return;

    if (photo) {
        preview.src = photo;
        preview.style.display = "block";
        placeholder.style.display = "none";
    } else {
        preview.removeAttribute("src");
        preview.style.display = "none";
        placeholder.style.display = "grid";
    }
}

function compressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => {
            const image = new Image();

            image.onload = () => {
                const maxSize = 600;

                const scale = Math.min(
                    1,
                    maxSize / Math.max(image.width, image.height)
                );

                const canvas = document.createElement("canvas");

                canvas.width = Math.round(image.width * scale);
                canvas.height = Math.round(image.height * scale);

                const context = canvas.getContext("2d");

                context.drawImage(
                    image,
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );

                resolve(canvas.toDataURL("image/jpeg", 0.82));
            };

            image.onerror = reject;
            image.src = reader.result;
        };

        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function handleProfilePhotoUpload(person, file) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        alert("Please select an image file.");
        return;
    }

    try {
        const compressed = await compressImage(file);

        if (person === "one") {
            accountProfile.personOnePhoto = compressed;
        } else {
            accountProfile.personTwoPhoto = compressed;
        }

        updateProfilePhoto(person, compressed);
    } catch (error) {
        console.error(error);
        alert("Could not load this photo. Please try another image.");
    }
}

document.getElementById("person-one-photo")?.addEventListener(
    "change",
    event => {
        handleProfilePhotoUpload("one", event.target.files[0]);
    }
);

document.getElementById("person-two-photo")?.addEventListener(
    "change",
    event => {
        handleProfilePhotoUpload("two", event.target.files[0]);
    }
);

document.getElementById("save-account-details")?.addEventListener(
    "click",
    () => {
        const personOneName =
            document.getElementById("person-one-name").value.trim();

        const personTwoName =
            document.getElementById("person-two-name").value.trim();

        const newStartDate =
            document.getElementById("account-savings-start-date").value;

        if (!newStartDate || newStartDate > getTodayKey()) {
            setText(
                "account-save-status",
                "Please select a valid start date."
            );
            return;
        }

        accountProfile.personOneName = personOneName;
        accountProfile.personTwoName = personTwoName;

        if (!saveToStorage(STORAGE_KEYS.account, accountProfile)) return;

        const oldStartDate = SAVINGS_START_DATE;
        SAVINGS_START_DATE = newStartDate;

        localStorage.setItem(
            "together-savings-start-date",
            newStartDate
        );

        setText(
            "account-save-status",
            oldStartDate === newStartDate
                ? "Account details saved successfully. ♥"
                : "Account details and start date updated."
        );

        renderAllSavings();
    }
);

function initializeAccountForm() {
    const input = document.getElementById(
        "account-savings-start-date"
    );

    if (input) {
        input.value = SAVINGS_START_DATE;
        input.max = getTodayKey();
    }

    loadAccountProfile();
}

/* =========================================
   18. NOTIFICATIONS & REMINDERS
========================================= */

const reminderToggle =
    document.getElementById("daily-reminder-toggle");

const milestoneToggle =
    document.getElementById("milestone-notification-toggle");

if (reminderToggle) {
    reminderToggle.checked =
        localStorage.getItem(STORAGE_KEYS.reminder) === "true";

    reminderToggle.addEventListener("change", () => {
        localStorage.setItem(
            STORAGE_KEYS.reminder,
            String(reminderToggle.checked)
        );

        setText(
            "notification-status",
            reminderToggle.checked
                ? "Daily reminder enabled."
                : "Daily reminder disabled."
        );

        checkDailyReminder();
    });
}

if (milestoneToggle) {
    milestoneToggle.checked =
        localStorage.getItem(STORAGE_KEYS.milestones) === "true";

    milestoneToggle.addEventListener("change", () => {
        localStorage.setItem(
            STORAGE_KEYS.milestones,
            String(milestoneToggle.checked)
        );
    });
}

document.getElementById("enable-notifications-button")?.addEventListener(
    "click",
    async () => {
        if (!("Notification" in window)) {
            setText(
                "notification-status",
                "This browser does not support notifications."
            );
            return;
        }

        const permission = await Notification.requestPermission();

        setText(
            "notification-status",
            permission === "granted"
                ? "Notifications enabled successfully. ♥"
                : "Notification permission was not granted."
        );

        checkDailyReminder();
    }
);

function sendLocalNotification(title, body, tag) {
    if (
        !("Notification" in window) ||
        Notification.permission !== "granted"
    ) {
        return false;
    }

    try {
        if (serviceWorkerRegistration?.showNotification) {
            serviceWorkerRegistration.showNotification(title, {
                body,
                icon: "assets/icons/icon-192.png",
                badge: "assets/icons/icon-192.png",
                tag
            });
        } else {
            new Notification(title, { body, tag });
        }

        return true;
    } catch (error) {
        console.warn("Notification error:", error);
        return false;
    }
}

function checkDailyReminder() {
    if (localStorage.getItem(STORAGE_KEYS.reminder) !== "true") return;

    if (
        !("Notification" in window) ||
        Notification.permission !== "granted"
    ) {
        return;
    }

    const now = new Date();

    if (now.getHours() !== 23 || now.getMinutes() < 30) return;

    const today = getTodayKey();

    if (
        localStorage.getItem(STORAGE_KEYS.lastReminder) === today
    ) {
        return;
    }

    const details = getSavingsDetails(today);
    if (!details) return;

    const mrSaved = isMrSaved(today);
    const mrsSaved = isMrsSaved(today);

    if (mrSaved && mrsSaved) return;

    const names = getPersonNames();

    let message = "";

    if (!mrSaved && !mrsSaved) {
        message = "Neither check-in has been completed today. Both of you still have time to save.";
    } else if (!mrSaved) {
        message = `${names.mr} has not checked in today's savings yet.`;
    } else {
        message = `${names.mrs} has not checked in today's savings yet.`;
    }

    const sent = sendLocalNotification(
        "TOGETHER ❤️ — A little reminder",
        message,
        `together-reminder-${today}`
    );

    if (sent) {
        localStorage.setItem(
            STORAGE_KEYS.lastReminder,
            today
        );
    }
}

function checkMilestoneNotifications() {
    if (localStorage.getItem(STORAGE_KEYS.milestones) !== "true") return;

    if (
        !("Notification" in window) ||
        Notification.permission !== "granted"
    ) {
        return;
    }

    const total = getTotalContributions();

    const notified = safeJSONParse(
        localStorage.getItem(STORAGE_KEYS.notifiedMilestones),
        []
    );

    MILESTONE_LEVELS.forEach(level => {
        if (total >= level && !notified.includes(level)) {
            const sent = sendLocalNotification(
                "A beautiful milestone! ♥",
                `Your contributions have reached ${formatMoney(level)}.`,
                `together-milestone-${level}`
            );

            if (sent) notified.push(level);
        }
    });

    localStorage.setItem(
        STORAGE_KEYS.notifiedMilestones,
        JSON.stringify(notified)
    );
}

/* =========================================
   19. PWA INSTALLATION
========================================= */

const installButton =
    document.getElementById("install-app-button");

window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();

    deferredInstallPrompt = event;

    if (installButton) {
        installButton.disabled = false;
        installButton.textContent = "Install TOGETHER";
    }

    setText(
        "install-app-status",
        "TOGETHER is ready to install on this device."
    );
});

window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;

    if (installButton) {
        installButton.disabled = true;
        installButton.textContent = "TOGETHER Installed";
    }

    setText(
        "install-app-status",
        "TOGETHER has been installed successfully. ♥"
    );
});

installButton?.addEventListener("click", async () => {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();

        const choice = await deferredInstallPrompt.userChoice;

        setText(
            "install-app-status",
            choice.outcome === "accepted"
                ? "Installation started. ♥"
                : "Installation was cancelled."
        );

        deferredInstallPrompt = null;
        return;
    }

    if (window.matchMedia("(display-mode: standalone)").matches) {
        setText(
            "install-app-status",
            "TOGETHER is already installed."
        );
    } else {
        setText(
            "install-app-status",
            "Use your browser's Install App option. On iPhone, use Share → Add to Home Screen."
        );
    }
});

/* =========================================
   20. SERVICE WORKER
========================================= */

if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
        try {
            serviceWorkerRegistration =
                await navigator.serviceWorker.register(
                    "./service-worker.js"
                );

            console.log("TOGETHER service worker registered.");
        } catch (error) {
            console.warn(
                "Service worker registration failed:",
                error
            );
        }
    });
}

/* =========================================
   21. INITIALIZATION
========================================= */

function initializeDateInputs() {
    const today = getTodayKey();

    const withdrawalDate =
        document.getElementById("withdrawal-date");

    if (withdrawalDate) {
        withdrawalDate.value = today;
        withdrawalDate.max = today;
    }

    if (previousDateInput) {
        const yesterday = parseLocalDate(today);
        yesterday.setDate(yesterday.getDate() - 1);

        previousDateInput.max = formatLocalDate(yesterday);
        previousDateInput.min = SAVINGS_START_DATE;
        previousDateInput.value = "";
    }

    if (previousEditor) {
        previousEditor.hidden = true;
    }
}

function initializeSavings() {
    loadSavingsData();

    seedHistoricalSavings();

    loadWithdrawals();
    initializeDateInputs();
    initializeAccountForm();

    renderAllSavings();

    checkMilestoneNotifications();
    checkDailyReminder();

    console.log("TOGETHER initialized successfully. ♥");
}

initializeSavings();

// Reminder checks run while the app is open.
// Browser notifications cannot guarantee delivery if the app is closed.
setInterval(checkDailyReminder, 30000);

console.log("TOGETHER ❤️ is ready.");
