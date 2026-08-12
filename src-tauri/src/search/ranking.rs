#[derive(Clone, Debug)]
pub struct RankingCandidate<T> {
    pub id: T,
    pub name: String,
    pub lexical: f64,
    pub semantic: Option<f64>,
    pub recency: f64,
    pub pinned: bool,
}

#[derive(Clone, Copy, Debug)]
pub struct RankingWeights {
    pub lexical: f64,
    pub semantic: f64,
    pub recency: f64,
    pub pin: f64,
}

impl Default for RankingWeights {
    fn default() -> Self {
        Self {
            lexical: 0.52,
            semantic: 0.34,
            recency: 0.08,
            pin: 0.06,
        }
    }
}

#[derive(Clone, Debug)]
pub struct RankedCandidate<T> {
    pub candidate: RankingCandidate<T>,
    pub exact_filename: bool,
    pub score: f64,
}

fn bounded(value: f64) -> f64 {
    if value.is_finite() {
        value.clamp(0.0, 1.0)
    } else {
        0.0
    }
}

fn exact_filename(query: &str, name: &str) -> bool {
    let query = query.trim().to_lowercase();
    let name = name.to_lowercase();
    name == query || name.rsplit_once('.').is_some_and(|(stem, _)| stem == query)
}

pub fn rank_candidates<T>(
    query: &str,
    candidates: Vec<RankingCandidate<T>>,
    weights: RankingWeights,
) -> Vec<RankedCandidate<T>> {
    let total_weight = weights.lexical + weights.semantic + weights.recency + weights.pin;
    let denominator = if total_weight.is_finite() && total_weight > 0.0 {
        total_weight
    } else {
        1.0
    };
    let mut ranked = candidates
        .into_iter()
        .map(|candidate| {
            let score = (bounded(candidate.lexical) * weights.lexical
                + bounded(candidate.semantic.unwrap_or(0.0)) * weights.semantic
                + bounded(candidate.recency) * weights.recency
                + if candidate.pinned { weights.pin } else { 0.0 })
                / denominator;
            RankedCandidate {
                exact_filename: exact_filename(query, &candidate.name),
                candidate,
                score: bounded(score),
            }
        })
        .collect::<Vec<_>>();
    ranked.sort_by(|left, right| {
        right
            .exact_filename
            .cmp(&left.exact_filename)
            .then_with(|| right.score.total_cmp(&left.score))
    });
    ranked
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_filename_tier_cannot_be_displaced_by_semantic_score() {
        let candidates = vec![
            RankingCandidate {
                id: "semantic",
                name: "different.txt".to_owned(),
                lexical: 0.0,
                semantic: Some(1.0),
                recency: 1.0,
                pinned: true,
            },
            RankingCandidate {
                id: "exact",
                name: "report.pdf".to_owned(),
                lexical: 0.1,
                semantic: None,
                recency: 0.0,
                pinned: false,
            },
        ];
        let ranked = rank_candidates("report", candidates, RankingWeights::default());
        assert_eq!(ranked[0].candidate.id, "exact");
        assert!(ranked[0].exact_filename);
    }

    #[test]
    fn semantic_recency_and_pin_lanes_are_independently_bounded() {
        let candidates = vec![
            RankingCandidate {
                id: "semantic",
                name: "a.txt".to_owned(),
                lexical: 0.0,
                semantic: Some(0.95),
                recency: 0.0,
                pinned: false,
            },
            RankingCandidate {
                id: "recent",
                name: "b.txt".to_owned(),
                lexical: 0.0,
                semantic: None,
                recency: 1.0,
                pinned: true,
            },
        ];
        let ranked = rank_candidates("query", candidates, RankingWeights::default());
        assert_eq!(ranked.len(), 2);
        assert!(ranked.iter().all(|item| (0.0..=1.0).contains(&item.score)));
        assert!(ranked[0].score > 0.0);
    }
}
