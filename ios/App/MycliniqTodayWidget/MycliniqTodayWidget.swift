import WidgetKit
import SwiftUI

private let appGroupId = "group.at.mycliniq.shared"
private let snapshotKey = "mycliniq_widget_today_v1"

private let mutedWhite = Color.white.opacity(0.82)
private let shellBlueTop = Color(red: 0.04, green: 0.14, blue: 0.27)
private let shellBlueMid = Color(red: 0.07, green: 0.27, blue: 0.50)
private let shellBlueBottom = Color(red: 0.06, green: 0.36, blue: 0.65)
private let shellHighlight = Color(red: 0.45, green: 0.68, blue: 0.96).opacity(0.24)
private let shellStroke = Color.white.opacity(0.12)
private let shellAlertTop = Color(red: 0.19, green: 0.08, blue: 0.20)
private let shellAlertMid = Color(red: 0.37, green: 0.10, blue: 0.24)
private let shellAlertBottom = Color(red: 0.61, green: 0.17, blue: 0.29)
private let shellAlertHighlight = Color(red: 1.00, green: 0.63, blue: 0.63).opacity(0.28)
private let chipBlue = Color.white.opacity(0.10)
private let chipBlueStrong = Color.white.opacity(0.14)
private let chipBorder = Color.white.opacity(0.14)
private let chipAlert = Color(red: 1.00, green: 0.93, blue: 0.95).opacity(0.14)
private let chipAlertStrong = Color(red: 1.00, green: 0.93, blue: 0.95).opacity(0.22)
private let chipAlertBorder = Color(red: 1.00, green: 0.84, blue: 0.88).opacity(0.38)
private let weeklyPlanURL = URL(string: "mycliniq://dienstplaene")
private let messagesURL = URL(string: "mycliniq://nachrichten")
private let toolsURL = URL(string: "mycliniq://tools")
private let sopsURL = URL(string: "mycliniq://admin/sops-projects")

extension View {
    @ViewBuilder
    func widgetBackgroundCompat() -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(for: .widget) { Color.clear }
        } else {
            self
        }
    }
}

struct WidgetShell<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [shellBlueTop, shellBlueMid, shellBlueBottom],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            RadialGradient(
                colors: [shellHighlight, .clear],
                center: .topTrailing,
                startRadius: 10,
                endRadius: 240
            )

            LinearGradient(
                colors: [Color.white.opacity(0.05), .clear],
                startPoint: .topLeading,
                endPoint: .center
            )

            content
                .padding(16)
        }
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(shellStroke, lineWidth: 1)
        )
    }
}

struct NotificationShell<Content: View>: View {
    let isAlert: Bool
    let content: Content

    init(isAlert: Bool, @ViewBuilder content: () -> Content) {
        self.isAlert = isAlert
        self.content = content()
    }

    private var topColor: Color { isAlert ? shellAlertTop : shellBlueTop }
    private var midColor: Color { isAlert ? shellAlertMid : shellBlueMid }
    private var bottomColor: Color { isAlert ? shellAlertBottom : shellBlueBottom }
    private var highlightColor: Color { isAlert ? shellAlertHighlight : shellHighlight }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [topColor, midColor, bottomColor],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            RadialGradient(
                colors: [highlightColor, .clear],
                center: .topTrailing,
                startRadius: 10,
                endRadius: 240
            )

            LinearGradient(
                colors: [Color.white.opacity(0.05), .clear],
                startPoint: .topLeading,
                endPoint: .center
            )

            content
                .padding(16)
        }
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(shellStroke, lineWidth: 1)
        )
    }
}

private func absoluteURL(_ path: String?) -> URL? {
    guard let value = path?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
        return nil
    }
    if value.hasPrefix("http://") || value.hasPrefix("https://") {
        return URL(string: value)
    }
    let trimmed = value.hasPrefix("/") ? String(value.dropFirst()) : value
    return URL(string: "mycliniq://\(trimmed)")
}

struct MycliniqNextDay: Decodable {
    let date: String
    let statusLabel: String?
    let workplace: String?
    let absenceReason: String?
    let dutyLabel: String?
    let isDuty: Bool
    let teammates: [String]?
}

struct MycliniqNotificationItem: Decodable {
    let id: String
    let title: String
    let subtitle: String?
    let tone: String?
    let targetUrl: String?
    let meta: String?
}

struct MycliniqQuickTool: Decodable {
    let key: String
    let title: String
    let shortLabel: String
    let targetUrl: String
}

struct MycliniqSopFavorite: Decodable {
    let id: Int
    let title: String
    let category: String?
    let targetUrl: String
}

struct MycliniqAdminSummary: Decodable {
    let enabled: Bool
    let presentToday: Int
    let absentToday: Int
    let dutyToday: Int
    let presentTomorrow: Int
    let dutyTomorrow: Int
}

struct MycliniqAdminAssignment: Decodable {
    let workplace: String
    let names: [String]
    let dutyNames: [String]
    let dutyCount: Int
}

struct MycliniqAdminDailyPlan: Decodable {
    let enabled: Bool
    let date: String?
    let assignments: [MycliniqAdminAssignment]
}

struct MycliniqSnapshot: Decodable {
    let version: Int
    let generatedAt: String
    let date: String?
    let personName: String?
    let statusLabel: String?
    let workplace: String?
    let absenceReason: String?
    let dutyLabel: String?
    let isDuty: Bool
    let teammates: [String]
    let nextDays: [MycliniqNextDay]?
    let adminSummary: MycliniqAdminSummary?
    let adminDailyPlan: MycliniqAdminDailyPlan?
    let notifications: [MycliniqNotificationItem]?
    let quickTools: [MycliniqQuickTool]?
    let sopFavorites: [MycliniqSopFavorite]?
}

struct MycliniqEntry: TimelineEntry {
    let date: Date
    let snapshot: MycliniqSnapshot?
}

struct MycliniqProvider: TimelineProvider {
    func placeholder(in context: Context) -> MycliniqEntry {
        MycliniqEntry(date: Date(), snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (MycliniqEntry) -> Void) {
        completion(MycliniqEntry(date: Date(), snapshot: loadSnapshot()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MycliniqEntry>) -> Void) {
        let entry = MycliniqEntry(date: Date(), snapshot: loadSnapshot())
        let nextRefresh = Calendar.current.date(byAdding: .minute, value: 10, to: Date()) ?? Date()
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }

    private func loadSnapshot() -> MycliniqSnapshot? {
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let json = defaults.string(forKey: snapshotKey),
              let data = json.data(using: .utf8) else {
            return nil
        }
        return try? JSONDecoder().decode(MycliniqSnapshot.self, from: data)
    }
}

struct MycliniqTodayWidgetEntryView: View {
    var entry: MycliniqProvider.Entry
    @Environment(\.widgetFamily) private var family

    private func isCalmStatus(status: String?, absenceReason: String?) -> Bool {
        if let reason = absenceReason, !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return true
        }
        let raw = (status ?? "").lowercased()
        return raw.contains("urlaub") || raw.contains("abwesen")
    }

    private func teammateLine(_ names: [String], maxNames: Int = 2) -> String? {
        let cleaned = names.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        guard !cleaned.isEmpty else { return nil }
        if cleaned.count <= maxNames {
            return "Mit: " + cleaned.joined(separator: ", ")
        }
        let visible = cleaned.prefix(maxNames).joined(separator: ", ")
        return "Mit: \(visible) +\(cleaned.count - maxNames)"
    }

    var body: some View {
        WidgetShell {
            if let snapshot = entry.snapshot {
                if family == .systemSmall {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Heute")
                            .font(.caption2)
                            .foregroundColor(mutedWhite)

                        Text(snapshot.statusLabel ?? "Kein Eintrag")
                            .font(.system(size: 15, weight: .bold))
                            .fontWeight(.bold)
                            .foregroundColor(isCalmStatus(status: snapshot.statusLabel, absenceReason: snapshot.absenceReason) ? .green : .white)
                            .lineLimit(4)

                        if snapshot.isDuty, let duty = snapshot.dutyLabel, !duty.isEmpty {
                            Text(duty)
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.white)
                                .lineLimit(1)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Color.red.opacity(0.88))
                                .clipShape(Capsule())
                        }
                    }
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("Heute")
                                .font(.caption2)
                                .foregroundColor(mutedWhite)

                            Spacer()

                            if snapshot.isDuty, let duty = snapshot.dutyLabel, !duty.isEmpty {
                                Text(duty)
                                    .font(.system(size: 11, weight: .bold))
                                    .fontWeight(.bold)
                                    .foregroundColor(.white)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Color.red.opacity(0.85))
                                    .clipShape(Capsule())
                            }
                        }

                        Text(snapshot.statusLabel ?? "Kein Eintrag")
                            .font(.system(size: 16, weight: .bold))
                            .fontWeight(.bold)
                            .foregroundColor(isCalmStatus(status: snapshot.statusLabel, absenceReason: snapshot.absenceReason) ? .green : .white)
                            .lineLimit(2)

                        if let workplace = snapshot.workplace, !workplace.isEmpty {
                            Text(workplace)
                                .font(.system(size: 11))
                                .foregroundColor(mutedWhite)
                                .lineLimit(1)
                        }

                        if let teamLine = teammateLine(snapshot.teammates) {
                            Text(teamLine)
                                .font(.system(size: 11))
                                .foregroundColor(mutedWhite)
                                .lineLimit(1)
                        }
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("mycliniq")
                        .font(.caption2)
                        .foregroundColor(mutedWhite)
                    Text("Keine Daten")
                        .font(.headline)
                        .foregroundColor(.white)
                    Text("App oeffnen, um zu synchronisieren")
                        .font(.caption2)
                        .foregroundColor(mutedWhite)
                }
            }
        }
    }
}

struct MycliniqNextDaysWidgetEntryView: View {
    var entry: MycliniqProvider.Entry
    @Environment(\.widgetFamily) private var family

    private func isCalmStatus(status: String?, absenceReason: String?) -> Bool {
        if let reason = absenceReason, !reason.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return true
        }
        let raw = (status ?? "").lowercased()
        return raw.contains("urlaub") || raw.contains("abwesen")
    }

    private func teammateLine(_ names: [String], maxNames: Int) -> String? {
        let cleaned = names.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        guard !cleaned.isEmpty else { return nil }
        if cleaned.count <= maxNames {
            return "Mit: " + cleaned.joined(separator: ", ")
        }
        let visible = cleaned.prefix(maxNames).joined(separator: ", ")
        return "Mit: \(visible) +\(cleaned.count - maxNames)"
    }

    private func formatDay(_ isoDate: String) -> String {
        let inputFormatter = DateFormatter()
        inputFormatter.calendar = Calendar(identifier: .gregorian)
        inputFormatter.locale = Locale(identifier: "en_US_POSIX")
        inputFormatter.timeZone = TimeZone(secondsFromGMT: 0)
        inputFormatter.dateFormat = "yyyy-MM-dd"

        guard let date = inputFormatter.date(from: isoDate) else {
            return isoDate
        }

        let weekdayFormatter = DateFormatter()
        weekdayFormatter.locale = Locale(identifier: "de_AT")
        weekdayFormatter.dateFormat = "EE"
        let weekday = weekdayFormatter.string(from: date)

        let dayFormatter = DateFormatter()
        dayFormatter.locale = Locale(identifier: "de_AT")
        dayFormatter.dateFormat = "dd.MM."
        let dayLabel = dayFormatter.string(from: date)

        return "\(weekday) \(dayLabel)"
    }

    var body: some View {
        WidgetShell {
            if let snapshot = entry.snapshot, let nextDays = snapshot.nextDays, !nextDays.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Nächste Tage")
                        .font(.caption2)
                        .foregroundColor(mutedWhite)

                    let rowLimit = family == .systemLarge ? 7 : 4
                    let showDetailedTeam = family == .systemLarge

                    ForEach(Array(nextDays.prefix(rowLimit).enumerated()), id: \.offset) { _, day in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(alignment: .firstTextBaseline, spacing: 6) {
                                Text(formatDay(day.date))
                                    .font(.system(size: 10, weight: .medium))
                                    .foregroundColor(mutedWhite)
                                    .frame(width: 74, alignment: .leading)

                                Text(day.statusLabel ?? day.workplace ?? "Kein Eintrag")
                                    .font(.system(size: 11, weight: .medium))
                                    .foregroundColor(isCalmStatus(status: day.statusLabel, absenceReason: day.absenceReason) ? .green : .white)
                                    .lineLimit(1)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(chipBlue)
                                    .overlay(
                                        RoundedRectangle(cornerRadius: 6)
                                            .stroke(chipBorder, lineWidth: 1)
                                    )
                                    .clipShape(RoundedRectangle(cornerRadius: 6))

                                Spacer(minLength: 0)

                                if day.isDuty {
                                    Text(day.dutyLabel ?? "Dienst")
                                        .font(.system(size: 10, weight: .semibold))
                                        .fontWeight(.semibold)
                                        .foregroundColor(.red)
                                        .lineLimit(1)
                                }
                            }

                            if let teamLine = teammateLine(day.teammates ?? [], maxNames: showDetailedTeam ? 3 : 2) {
                                Text(teamLine)
                                    .font(.system(size: 10))
                                    .foregroundColor(mutedWhite)
                                    .lineLimit(1)
                                    .padding(.leading, 80)
                            }
                        }
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("mycliniq")
                        .font(.caption2)
                        .foregroundColor(mutedWhite)
                    Text("Keine Vorschau")
                        .font(.headline)
                        .foregroundColor(.white)
                    Text("App oeffnen, um zu synchronisieren")
                        .font(.caption2)
                        .foregroundColor(mutedWhite)
                }
            }
        }
    }
}

struct MycliniqAdminOverviewWidgetEntryView: View {
    var entry: MycliniqProvider.Entry
    @Environment(\.widgetFamily) private var family

    private func namesLine(_ names: [String], maxNames: Int) -> String {
        if names.isEmpty { return "Keine Zuteilung" }
        if names.count <= maxNames {
            return names.joined(separator: ", ")
        }
        let visible = names.prefix(maxNames).joined(separator: ", ")
        return "\(visible) +\(names.count - maxNames)"
    }

    private var areaTitleSize: CGFloat {
        family == .systemLarge ? 11 : 10
    }

    private var detailSize: CGFloat {
        family == .systemLarge ? 10 : 9
    }

    var body: some View {
        WidgetShell {
            if let dailyPlan = entry.snapshot?.adminDailyPlan,
               dailyPlan.enabled {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Tageseinsatz")
                        .font(.caption2)
                        .foregroundColor(mutedWhite)

                    let rowLimit = family == .systemLarge ? 8 : 6
                    ForEach(Array(dailyPlan.assignments.prefix(rowLimit).enumerated()), id: \.offset) { _, assignment in
                        VStack(alignment: .leading, spacing: 1.5) {
                            HStack(alignment: .firstTextBaseline, spacing: 6) {
                                Text(assignment.workplace)
                                    .font(.system(size: areaTitleSize, weight: .semibold))
                                    .fontWeight(.semibold)
                                    .foregroundColor(.white)
                                    .lineLimit(1)
                                Spacer()
                                if assignment.dutyCount > 0 {
                                    Text("\(assignment.dutyCount) D")
                                        .font(.system(size: detailSize, weight: .bold))
                                        .fontWeight(.bold)
                                        .foregroundColor(.red)
                                }
                            }
                            Text(namesLine(assignment.names, maxNames: family == .systemLarge ? 4 : 3))
                                .font(.system(size: detailSize))
                                .foregroundColor(mutedWhite)
                                .lineLimit(1)

                            if !assignment.dutyNames.isEmpty {
                                Text(namesLine(assignment.dutyNames, maxNames: family == .systemLarge ? 3 : 2))
                                    .font(.system(size: detailSize, weight: .medium))
                                    .foregroundColor(.red)
                                    .lineLimit(1)
                            }
                        }
                        .padding(.horizontal, 7)
                        .padding(.vertical, 4)
                        .background(chipBlue)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(chipBorder, lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                    }

                    if let weeklyPlanURL {
                        Link(destination: weeklyPlanURL) {
                            Text("Zum Wochenplan")
                                .font(.system(size: detailSize, weight: .semibold))
                                .fontWeight(.semibold)
                                .foregroundColor(.white)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(chipBlue)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(chipBorder, lineWidth: 1)
                                )
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Tageseinsatz")
                        .font(.caption)
                        .foregroundColor(mutedWhite)
                    Text("Keine Einsatzdaten")
                        .font(.headline)
                        .foregroundColor(.white)
                    Text("App öffnen, um zu synchronisieren")
                        .font(.caption2)
                        .foregroundColor(mutedWhite)
                }
            }
        }
    }
}

struct MycliniqNotificationsWidgetEntryView: View {
    var entry: MycliniqProvider.Entry
    @Environment(\.widgetFamily) private var family

    private func accentColor(for tone: String?) -> Color {
        tone == "danger" ? Color(red: 1.0, green: 0.89, blue: 0.91) : Color.white.opacity(0.92)
    }

    private func titleColor(for tone: String?) -> Color {
        tone == "danger" ? Color.white : Color.white.opacity(0.96)
    }

    private func rowFill(for tone: String?) -> Color {
        tone == "danger" ? chipAlert : chipBlue
    }

    private func rowBorder(for tone: String?) -> Color {
        tone == "danger" ? chipAlertBorder : chipBorder
    }

    private var hasAlertItems: Bool {
        (entry.snapshot?.notifications ?? []).contains { $0.tone == "danger" }
    }

    var body: some View {
        NotificationShell(isAlert: hasAlertItems) {
            let items = entry.snapshot?.notifications ?? []

            if items.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Notifications")
                        .font(.caption2)
                        .foregroundColor(mutedWhite)
                    Text("Keine neuen Hinweise")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                    Text("Inbox, Freigaben und Änderungen erscheinen hier")
                        .font(.system(size: 11))
                        .foregroundColor(mutedWhite)
                }
            } else if family == .systemSmall {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Notifications")
                        .font(.caption2)
                        .foregroundColor(mutedWhite)

                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("\(items.count)")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundColor(.white)

                        if hasAlertItems {
                            Text("Neu")
                                .font(.system(size: 10, weight: .bold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(chipAlertStrong)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 8)
                                        .stroke(chipAlertBorder, lineWidth: 1)
                                )
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                    }

                    Text(items[0].title)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(titleColor(for: items[0].tone))
                        .lineLimit(3)

                    if let subtitle = items[0].subtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.system(size: 10))
                            .foregroundColor(mutedWhite)
                            .lineLimit(2)
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Notifications")
                            .font(.caption2)
                            .foregroundColor(mutedWhite)
                        Spacer()
                        Text("\(items.count)")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 3)
                            .background(hasAlertItems ? chipAlertStrong : chipBlueStrong)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(hasAlertItems ? chipAlertBorder : chipBorder, lineWidth: 1)
                            )
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }

                    ForEach(Array(items.prefix(family == .systemLarge ? 5 : 3).enumerated()), id: \.offset) { _, item in
                        let row = HStack(alignment: .top, spacing: 8) {
                            RoundedRectangle(cornerRadius: 2)
                                .fill(accentColor(for: item.tone))
                                .frame(width: 3)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.title)
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundColor(titleColor(for: item.tone))
                                    .lineLimit(1)
                                if let subtitle = item.subtitle, !subtitle.isEmpty {
                                    Text(subtitle)
                                        .font(.system(size: 10))
                                        .foregroundColor(mutedWhite)
                                        .lineLimit(2)
                                }
                            }
                            Spacer(minLength: 0)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 6)
                        .background(rowFill(for: item.tone))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(rowBorder(for: item.tone), lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 10))

                        if let url = absoluteURL(item.targetUrl) {
                            Link(destination: url) { row }
                        } else {
                            row
                        }
                    }
                }
            }
        }
    }
}

struct MycliniqToolsWidgetEntryView: View {
    var entry: MycliniqProvider.Entry
    @Environment(\.widgetFamily) private var family

    private var tools: [MycliniqQuickTool] {
        entry.snapshot?.quickTools ?? []
    }

    private var limit: Int {
        switch family {
        case .systemSmall:
            return 4
        case .systemLarge:
            return 6
        default:
            return 4
        }
    }

    var body: some View {
        WidgetShell {
            VStack(alignment: .leading, spacing: 10) {
                Text("Quick Tools")
                    .font(.caption2)
                    .foregroundColor(mutedWhite)

                if tools.isEmpty {
                    Text("Keine Tools verfügbar")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundColor(.white)
                } else {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        ForEach(Array(tools.prefix(limit).enumerated()), id: \.offset) { _, tool in
                            if let url = absoluteURL(tool.targetUrl) {
                                Link(destination: url) {
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(tool.shortLabel)
                                            .font(.system(size: 11, weight: .bold))
                                            .foregroundColor(.white)
                                            .lineLimit(1)
                                        Text(tool.title)
                                            .font(.system(size: 10))
                                            .foregroundColor(mutedWhite)
                                            .lineLimit(2)
                                    }
                                    .frame(maxWidth: .infinity, minHeight: family == .systemLarge ? 58 : 48, alignment: .topLeading)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 8)
                                    .background(chipBlue)
                                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(chipBorder, lineWidth: 1))
                                    .clipShape(RoundedRectangle(cornerRadius: 12))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

struct MycliniqSopFavoritesWidgetEntryView: View {
    var entry: MycliniqProvider.Entry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        WidgetShell {
            let favorites = entry.snapshot?.sopFavorites ?? []

            if favorites.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("SOP Favoriten")
                        .font(.caption2)
                        .foregroundColor(mutedWhite)
                    Text("Keine Favoriten")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundColor(.white)
                    Text("Favoriten in der App definieren")
                        .font(.system(size: 11))
                        .foregroundColor(mutedWhite)
                }
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text("SOP Favoriten")
                        .font(.caption2)
                        .foregroundColor(mutedWhite)

                    ForEach(Array(favorites.prefix(family == .systemSmall ? 1 : family == .systemLarge ? 4 : 2).enumerated()), id: \.offset) { _, sop in
                        let row = VStack(alignment: .leading, spacing: 3) {
                            Text(sop.title)
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(.white)
                                .lineLimit(family == .systemSmall ? 4 : 2)
                            if let category = sop.category, !category.isEmpty {
                                Text(category)
                                    .font(.system(size: 10))
                                    .foregroundColor(mutedWhite)
                                    .lineLimit(1)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 7)
                        .background(chipBlue)
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(chipBorder, lineWidth: 1))
                        .clipShape(RoundedRectangle(cornerRadius: 10))

                        if let url = absoluteURL(sop.targetUrl) {
                            Link(destination: url) { row }
                        } else {
                            row
                        }
                    }
                }
            }
        }
    }
}

struct MycliniqTodayWidget: Widget {
    let kind: String = "MycliniqTodayWidget"

    var body: some WidgetConfiguration {
        let configuration = StaticConfiguration(kind: kind, provider: MycliniqProvider()) { entry in
            MycliniqTodayWidgetEntryView(entry: entry)
                .widgetBackgroundCompat()
        }
        .configurationDisplayName("mycliniq Heute")
        .description("Zeigt den aktuellen Tagesstatus aus dem Dashboard.")
        .supportedFamilies([.systemSmall, .systemMedium])

        if #available(iOSApplicationExtension 15.0, *) {
            return configuration.contentMarginsDisabled()
        }
        return configuration
    }
}

struct MycliniqNextDaysWidget: Widget {
    let kind: String = "MycliniqNextDaysWidget"

    var body: some WidgetConfiguration {
        let configuration = StaticConfiguration(kind: kind, provider: MycliniqProvider()) { entry in
            MycliniqNextDaysWidgetEntryView(entry: entry)
                .widgetBackgroundCompat()
        }
        .configurationDisplayName("mycliniq Nächste Tage")
        .description("Zeigt die nächsten geplanten Tage aus dem Dashboard.")
        .supportedFamilies([.systemMedium, .systemLarge])

        if #available(iOSApplicationExtension 15.0, *) {
            return configuration.contentMarginsDisabled()
        }
        return configuration
    }
}

struct MycliniqAdminOverviewWidget: Widget {
    let kind: String = "MycliniqAdminOverviewWidget"

    var body: some WidgetConfiguration {
        let configuration = StaticConfiguration(kind: kind, provider: MycliniqProvider()) { entry in
            MycliniqAdminOverviewWidgetEntryView(entry: entry)
                .widgetBackgroundCompat()
                .widgetURL(weeklyPlanURL)
        }
        .configurationDisplayName("mycliniq Tageseinsatz")
        .description("Zeigt Bereichsbesetzung und rot markierte Diensthabende.")
        .supportedFamilies([.systemMedium, .systemLarge])

        if #available(iOSApplicationExtension 15.0, *) {
            return configuration.contentMarginsDisabled()
        }
        return configuration
    }
}

struct MycliniqNotificationsWidget: Widget {
    let kind: String = "MycliniqNotificationsWidget"

    var body: some WidgetConfiguration {
        let configuration = StaticConfiguration(kind: kind, provider: MycliniqProvider()) { entry in
            MycliniqNotificationsWidgetEntryView(entry: entry)
                .widgetBackgroundCompat()
                .widgetURL(messagesURL)
        }
        .configurationDisplayName("mycliniq Notifications")
        .description("Zeigt Hinweise, Freigaben und offene Änderungen.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])

        if #available(iOSApplicationExtension 15.0, *) {
            return configuration.contentMarginsDisabled()
        }
        return configuration
    }
}

struct MycliniqToolsWidget: Widget {
    let kind: String = "MycliniqToolsWidget"

    var body: some WidgetConfiguration {
        let configuration = StaticConfiguration(kind: kind, provider: MycliniqProvider()) { entry in
            MycliniqToolsWidgetEntryView(entry: entry)
                .widgetBackgroundCompat()
                .widgetURL(toolsURL)
        }
        .configurationDisplayName("mycliniq Quick Tools")
        .description("Schnellzugriff auf die wichtigsten Funktionen.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])

        if #available(iOSApplicationExtension 15.0, *) {
            return configuration.contentMarginsDisabled()
        }
        return configuration
    }
}

struct MycliniqSopFavoritesWidget: Widget {
    let kind: String = "MycliniqSopFavoritesWidget"

    var body: some WidgetConfiguration {
        let configuration = StaticConfiguration(kind: kind, provider: MycliniqProvider()) { entry in
            MycliniqSopFavoritesWidgetEntryView(entry: entry)
                .widgetBackgroundCompat()
                .widgetURL(sopsURL)
        }
        .configurationDisplayName("mycliniq SOP Favoriten")
        .description("Zeigt bevorzugte Leitlinien für den Schnellzugriff.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])

        if #available(iOSApplicationExtension 15.0, *) {
            return configuration.contentMarginsDisabled()
        }
        return configuration
    }
}
