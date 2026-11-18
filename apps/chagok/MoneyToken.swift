// User-owned NataeJiok algorithm migrated under ADR-019.
import Foundation
struct MoneyToken: Sendable, Equatable {
    var amount: Decimal
    var currency: String?
    var location: Int
    var role: Role

    enum Role: String, Sendable {
        case transaction
        case balance
        case fee
        case converted
        case promo
        case unknown
    }

    var double: Double { NSDecimalNumber(decimal: amount).doubleValue }
}

enum MoneyScanner {

    private static let symbols: [(String, String)] = [
        ("₩", "KRW"), ("￦", "KRW"), ("원", "KRW"),
        ("a$", "AUD"), ("aud", "AUD"), ("au$", "AUD"),
        ("us$", "USD"), ("usd", "USD"),
        ("€", "EUR"), ("eur", "EUR"),
        ("¥", "JPY"), ("jpy", "JPY"), ("엔", "JPY"),
        ("£", "GBP"), ("gbp", "GBP"),
        ("nz$", "NZD"), ("nzd", "NZD"),
        ("sgd", "SGD"), ("cad", "CAD"),
    ]

    private static let balanceWords = [
        "balance", "bal:", "available", "avail ", "remaining", "funds",
        "잔액", "잔고", "남은 금액", "사용가능",
    ]
    private static let feeWords = ["fee", "surcharge", "charge of", "수수료", "이용료"]
    private static let convertedWords = [
        "approx", "approximately", "≈", "~=", "converted", "equivalent",
        "환산", "약 ",
    ]
    private static let proposalWords = [
        "earn ", "offer", "could get", "save up to", "up to ", "when you spend",
        "eligible", "promotion",
        "적립하면", "받을 수 있", "쿠폰", "이벤트", "혜택 받",
    ]

    static func scan(_ text: String) -> [MoneyToken] {
        let pattern = #"(?<![\d.,])(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?![\d,]*\d)"#
        guard let re = try? NSRegularExpression(pattern: pattern) else { return [] }
        let ns = text as NSString
        let low = text.lowercased() as NSString
        let bounds = clauseBounds(text)
        let datePattern = #"(?<![0-9])(?:[0-9]{4}[-/][0-9]{1,2}[-/][0-9]{1,2}|[0-9]{1,2}[/-][0-9]{1,2}(?:[/-][0-9]{4})?|[0-9]{1,2}월\s*[0-9]{1,2}일)(?![0-9])"#
        let dates = (try? NSRegularExpression(pattern: datePattern))?.matches(in:text,range:NSRange(location:0,length:ns.length)).map(\.range) ?? []

        var out: [MoneyToken] = []
        for m in re.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            if dates.contains(where: { NSIntersectionRange($0,m.range).length > 0 }) { continue }
            let raw = ns.substring(with: m.range(at: 1)).replacingOccurrences(of: ",", with: "")
            guard let dec = Decimal(string: raw), dec > 0 else { continue }

            let ctxBefore = context(low, before: m.range.location, length: 24)
            let ctxAfter = context(low, after: m.range.location + m.range.length, length: 24)
            if isNotMoney(raw: raw, before: ctxBefore, after: ctxAfter) { continue }

            out.append(MoneyToken(
                amount: dec,
                currency: currency(before: ctxBefore, after: ctxAfter),
                location: m.range.location,
                role: role(in: low, at: m.range.location, clause: clause(bounds, m.range.location))))
        }
        return out
    }

    private static func clauseBounds(_ text: String) -> [NSRange] {
        let ns = text as NSString
        guard let re = try? NSRegularExpression(pattern: #"[.;!?·]\s+|\s+[-–]\s+|\n"#)
        else { return [NSRange(location: 0, length: ns.length)] }

        var out: [NSRange] = []
        var start = 0
        for m in re.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            let end = m.range.location + m.range.length
            out.append(NSRange(location: start, length: end - start))
            start = end
        }
        if start < ns.length { out.append(NSRange(location: start, length: ns.length - start)) }
        return out.isEmpty ? [NSRange(location: 0, length: ns.length)] : out
    }

    private static func clause(_ bounds: [NSRange], _ loc: Int) -> NSRange {
        bounds.first { loc >= $0.location && loc < $0.location + $0.length }
            ?? NSRange(location: loc, length: 0)
    }

    static func transactionAmount(_ tokens: [MoneyToken]) -> MoneyToken? {
        let tx = tokens.filter { $0.role == .transaction }
        if let first = tx.min(by: { $0.location < $1.location }) { return first }
        let unknown = tokens.filter { $0.role == .unknown }
        guard unknown.count == tokens.count else { return nil }
        return unknown.min(by: { $0.location < $1.location })
    }


    private static func context(_ s: NSString, before loc: Int, length: Int) -> String {
        let start = max(0, loc - length)
        return s.substring(with: NSRange(location: start, length: loc - start))
    }
    private static func context(_ s: NSString, after loc: Int, length: Int) -> String {
        guard loc < s.length else { return "" }
        return s.substring(with: NSRange(location: loc, length: min(length, s.length - loc)))
    }

    private static func isNotMoney(raw: String, before: String, after: String) -> Bool {
        let b = before.trimmingCharacters(in: .whitespaces)
        if b.hasSuffix("ending") || b.hasSuffix("x") || b.hasSuffix("*")
            || b.hasSuffix("no.") || b.hasSuffix("no") { return true }
        if b.hasSuffix(":") || after.hasPrefix(":") { return true }
        if after.trimmingCharacters(in: .whitespaces).hasPrefix("%") { return true }
        return false
    }

    private static func currency(before: String, after: String) -> String? {
        let a = after.trimmingCharacters(in: .whitespaces)
        for (sym, code) in symbols where a.hasPrefix(sym) { return code }
        let b = before.replacingOccurrences(of: " ", with: "")
        for (sym, code) in symbols.sorted(by: { $0.0.count > $1.0.count })
        where b.hasSuffix(sym) { return code }
        if b.hasSuffix("$") { return "AUD" }
        return nil
    }

    private static func role(in low: NSString, at loc: Int, clause: NSRange) -> MoneyToken.Role {
        guard clause.length > 0 else { return .unknown }
        let text = low.substring(with: clause)
        let rel = loc - clause.location

        func distance(_ words: [String]) -> Int? {
            var best: Int?
            for w in words {
                var from = text.startIndex
                while let r = text.range(of: w, range: from..<text.endIndex) {
                    let at = text.distance(from: text.startIndex, to: r.lowerBound)
                    let d = abs(at - rel)
                    if best == nil || d < best! { best = d }
                    from = r.upperBound
                    if from >= text.endIndex { break }
                }
            }
            return best
        }

        let candidates: [(MoneyToken.Role, Int?)] = [
            (.promo, distance(proposalWords)),
            (.converted, distance(convertedWords)),
            (.fee, distance(feeWords)),
            (.balance, distance(balanceWords)),
            (.transaction, distance(transactionWords)),
        ]
        let found = candidates.compactMap { r, d in d.map { (r, $0) } }
        guard let winner = found.min(by: { $0.1 < $1.1 }) else { return .unknown }
        return winner.0
    }

    static let transactionWords = [
        "spent", "paid", "payment", "purchase", "withdrawn", "withdrawal",
        "debited", "charged", "received", "deposited", "credited", "transfer",
        "refund", "sent", "넣어드렸",
        "결제", "출금", "입금", "송금", "보냈", "이체", "환불", "승인", "사용",
    ]
}
