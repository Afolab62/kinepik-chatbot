import json
import os
import re
import sys
import uuid

# Set the matplotlib config directory before importing matplotlib to avoid permission errors
os.environ.setdefault("MPLCONFIGDIR", os.path.join(os.getcwd(), ".matplotlib_cache"))

import matplotlib

# Use the non-interactive Agg backend so charts can be saved to files without a display
matplotlib.use("Agg")

import matplotlib.pyplot as plt

# Directory where this file lives — used to build absolute paths to the output folder
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _output_dir():
    configured = os.environ.get("KINEPIK_VISUALIZATION_DIR")
    if configured:
        return os.path.abspath(configured)
    return os.path.join(_BASE_DIR, "static")


def _save_static(filename):
    """Return the absolute path to save a file in the output folder, creating it if needed."""
    static_dir = _output_dir()
    os.makedirs(static_dir, exist_ok=True)
    return os.path.join(static_dir, filename)


def _public_url_for(abs_path):
    output_dir = _output_dir()
    if abs_path.startswith(output_dir):
        rel_path = os.path.relpath(abs_path, os.path.dirname(output_dir))
        return rel_path.replace(os.sep, "/")
    return os.path.basename(abs_path)


def _slugify(value):
    slug = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return slug[:60] or "kinepik-visualization"


def _build_output_name(prefix, label=None):
    suffix = uuid.uuid4().hex[:10]
    slug = _slugify(label or prefix)
    return f"{prefix}-{slug}-{suffix}.png"


def _resolve_labels(uniprot_ids):
    """Convert a list of UniProt IDs to gene names using KINEPIK.
    Only IDs that look like UniProt accessions are looked up — others are passed through as-is.
    Returns a dict {uniprot_id: gene_name}."""
    from utils import batch_uniprot_to_gene, looks_like_uniprot_id
    ids_to_resolve = [uid for uid in uniprot_ids if looks_like_uniprot_id(uid)]
    if not ids_to_resolve:
        return {}
    return batch_uniprot_to_gene(ids_to_resolve)


def _style_ax(ax):
    """Apply consistent styling to a matplotlib axes: dashed grid lines, no top/right border."""
    ax.yaxis.grid(True, linestyle="--", linewidth=0.5, color="#d1d5db", zorder=0)
    ax.set_axisbelow(True)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.tick_params(axis="x", labelsize=9)
    ax.tick_params(axis="y", labelsize=9)


def _add_value_labels(ax, bars, scores):
    """Print the z-score value above (positive) or below (negative) each bar in a chart."""
    for bar, score in zip(bars, scores):
        offset = 0.05 if score >= 0 else -0.05
        va = "bottom" if score >= 0 else "top"
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            score + offset,
            f"{score:.2f}",
            ha="center",
            va=va,
            fontsize=7.5,
            color="#111827",
        )


def plot_ksea(data, perturbation=None, direction=None, title=None):
    """Draw a bar chart of KSEA z-scores for the top kinases under a perturbation.
    Bars are sorted from most positive (activated) to most negative (inhibited).
    direction: 'positive', 'negative', or None — used only for the chart title."""
    rows = sorted(data[:10], key=lambda r: r["z_score"], reverse=True)
    raw_ids = [row["kinase"] for row in rows]
    label_map = _resolve_labels(raw_ids)
    kinases = [label_map.get(uid, uid) for uid in raw_ids]
    scores = [row["z_score"] for row in rows]
    perturbation = perturbation or (rows[0].get("perturbation", "selected condition") if rows else "selected condition")
    colors = ["#2563eb" if score >= 0 else "#dc2626" for score in scores]

    direction_label = {
        "positive": "Most Activated",
        "negative": "Most Inhibited",
    }.get(direction, "Top Activity Changes")

    fig, ax = plt.subplots(figsize=(12, 6.75))
    bars = ax.bar(kinases, scores, color=colors, edgecolor="white", linewidth=0.6, zorder=3)
    ax.axhline(0, color="#374151", linewidth=0.9, zorder=4)
    _style_ax(ax)
    _add_value_labels(ax, bars, scores)

    ax.set_ylabel("Z-score", fontsize=11)
    ax.set_title(f"KSEA {direction_label} — {perturbation}", fontsize=12, fontweight="bold", pad=10)
    plt.xticks(rotation=40, ha="right")
    fig.tight_layout()

    abs_path = _save_static(_build_output_name("ksea", title or perturbation or direction_label))
    fig.savefig(abs_path, dpi=220, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    return _public_url_for(abs_path)


def plot_top_connected_kinases(kinase_names, connection_counts, title=None):
    """Draw a horizontal bar chart of the top connected kinases ranked by number of connections.

    Parameters
    ----------
    kinase_names : list[str]
        Gene names or IDs of the top kinases, ordered from most to least connected.
    connection_counts : list[int]
        Connection counts corresponding to each kinase.

    Returns
    -------
    str
        Relative path to the saved image.
    """
    # Reverse so highest is at the top
    names = kinase_names[::-1]
    counts = connection_counts[::-1]
    colors = ["#2563eb"] * len(names)

    colors = ["#2563eb"] * len(names)

    fig, ax = plt.subplots(figsize=(12, 7))
    bars = ax.barh(names, counts, color=colors, edgecolor="white", linewidth=0.6, zorder=3)

    for bar, count in zip(bars, counts):
        ax.text(
            bar.get_width() + 5,
            bar.get_y() + bar.get_height() / 2,
            str(count),
            va="center",
            fontsize=9,
            color="#111827",
        )

    ax.set_xlabel("Number of Connections", fontsize=11)
    ax.set_title(
        "Most Connected Kinases — KINEPIK Signalling Network",
        fontsize=12, fontweight="bold", pad=12,
    )
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.xaxis.grid(True, linestyle="--", linewidth=0.5, color="#d1d5db", zorder=0)
    ax.set_axisbelow(True)
    fig.tight_layout()

    abs_path = _save_static(_build_output_name("top-connected", title or "network-hubs"))
    fig.savefig(abs_path, dpi=220, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    return _public_url_for(abs_path)


def plot_connectivity_heatmap(kinase_names, family_labels, connection_counts, title=None):
        """Draw a heatmap of kinase connectivity grouped by inferred kinase family.

        Rows are kinase families and columns are the top connected kinases.
        Each kinase contributes one colored cell in its family row, with intensity
        reflecting degree (number of neighbors).
        """
        import numpy as np
        import matplotlib.cm as cm
        import matplotlib.colors as mcolors

        if not kinase_names or not connection_counts or len(kinase_names) != len(connection_counts):
            return None

        labels = list(kinase_names)
        counts = [float(v) for v in connection_counts]
        families = list(family_labels or ["OTHER"] * len(labels))

        family_order = ["AGC", "CAMK", "CK1", "CMGC", "STE", "TK", "TKL", "OTHER"]
        rows = [f for f in family_order if f in set(families)]
        if not rows:
            rows = ["OTHER"]

        # Order columns by family, then descending connectivity within each family.
        indices = list(range(len(labels)))
        indices.sort(
                key=lambda i: (
                        family_order.index(families[i]) if families[i] in family_order else len(family_order),
                        -counts[i],
                        labels[i],
                )
        )
        labels = [labels[i] for i in indices]
        counts = [counts[i] for i in indices]
        families = [families[i] for i in indices]

        grid = np.full((len(rows), len(labels)), np.nan, dtype=float)
        for col, (fam, degree) in enumerate(zip(families, counts)):
            if fam not in rows:
                continue
            row = rows.index(fam)
            grid[row, col] = degree

        finite_vals = grid[~np.isnan(grid)]
        if finite_vals.size == 0:
            return None
        vmin = float(np.min(finite_vals))
        vmax = float(np.max(finite_vals))
        if vmin == vmax:
            vmax = vmin + 1.0

        cmap = cm.Blues
        norm = mcolors.Normalize(vmin=vmin, vmax=vmax)

        fig_w = max(13, len(labels) * 0.55)
        fig_h = max(4.5, len(rows) * 1.0)
        fig, ax = plt.subplots(figsize=(fig_w, fig_h))

        for i in range(len(rows)):
            for j in range(len(labels)):
                val = grid[i, j]
                if np.isnan(val):
                    face = "#f3f4f6"
                    text = ""
                    text_color = "#9ca3af"
                else:
                    face = cmap(norm(val))
                    text = str(int(round(val)))
                    text_color = "white" if (val - vmin) / max(vmax - vmin, 1e-9) > 0.55 else "#111827"
                ax.add_patch(
                    plt.Rectangle((j - 0.5, i - 0.5), 1, 1, facecolor=face, edgecolor="white", lw=0.6)
                )
                if text:
                    ax.text(j, i, text, ha="center", va="center", fontsize=7.5, color=text_color, fontweight="bold")

        ax.set_xlim(-0.5, len(labels) - 0.5)
        ax.set_ylim(-0.5, len(rows) - 0.5)
        ax.invert_yaxis()
        ax.set_xticks(range(len(labels)))
        ax.set_xticklabels(labels, rotation=55, ha="right", fontsize=8)
        ax.set_yticks(range(len(rows)))
        ax.set_yticklabels(rows, fontsize=9, fontweight="bold")
        ax.tick_params(length=0)

        sm = cm.ScalarMappable(cmap=cmap, norm=norm)
        sm.set_array([])
        cbar = fig.colorbar(sm, ax=ax, label="Connectivity degree", shrink=0.78, pad=0.02)
        cbar.ax.tick_params(labelsize=8)

        for spine in ax.spines.values():
            spine.set_visible(False)

        ax.set_title(
            "Top Connected Kinases Grouped by Family\nDarker cells indicate higher network connectivity",
            fontsize=11,
            fontweight="bold",
            pad=10,
        )

        fig.tight_layout()
        abs_path = _save_static(_build_output_name("connectivity-heatmap", title or "connectivity-heatmap"))
        fig.savefig(abs_path, dpi=240, bbox_inches="tight", facecolor=fig.get_facecolor())
        plt.close(fig)
        return _public_url_for(abs_path)


def plot_network(records, central_label, kinase_id=None, title=None):
    """Draw a relationship-strength network for a queried kinase.

    Nodes are placed radially around the central kinase.  The closer a node is
    to the centre, and the larger its bubble, the more interaction edges it
    shares with the central kinase in the KINEPIK dataset.  Bidirectional
    relationships (the neighbour both receives and sends phosphorylation signals
    to the central node) are highlighted with a thicker edge.

    All UniProt IDs are resolved to gene names via KINEPIK before drawing.
    Returns the relative path to the saved image, or None if no connections
    were found.

    Parameters
    ----------
    records : list
        Raw interaction records — either plain-text SIF strings
        (``"P42345 phosphorylates Q6PKG0"``) or dicts with source/target keys.
    central_label : str
        Display name for the queried kinase (used as fallback label).
    kinase_id : str or None
        UniProt ID of the central kinase; overrides ``central_label`` for graph
        lookups when provided.
    """
    try:
        import networkx as nx
    except ImportError:
        return None

    import math
    from utils import batch_uniprot_to_gene, looks_like_uniprot_id

    # Use a MultiDiGraph so parallel edges (multiple interaction types between
    # the same pair) are preserved and can be counted as interaction strength.
    G = nx.MultiDiGraph()

    SOURCE_KEYS = ["source", "Source", "from", "From", "Kinase", "kinase"]
    TARGET_KEYS = ["target", "Target", "to", "To", "Substrate", "substrate"]

    for item in records:
        if isinstance(item, str):
            parts = item.strip().split()
            if len(parts) >= 3:
                source, target = parts[0], parts[2]
            elif len(parts) == 2:
                source, target = parts[0], parts[1]
            else:
                continue
        elif isinstance(item, dict):
            source = next((item[k] for k in SOURCE_KEYS if item.get(k)), None)
            target = next((item[k] for k in TARGET_KEYS if item.get(k)), None)
            if not source or not target:
                continue
        else:
            continue

        G.add_edge(source, target)

    if G.number_of_edges() == 0:
        return None

    central_id = kinase_id if kinase_id else central_label

    # Keep only nodes directly connected to the central kinase, cap at 24
    neighbours = set(G.predecessors(central_id)) | set(G.successors(central_id))
    selected = list(neighbours)[:24]
    subG = G.subgraph(selected + [central_id]).copy()
    subG.remove_edges_from(nx.selfloop_edges(subG))

    # --- Compute per-neighbour relationship strength ---
    # strength = total edges in both directions between central node and neighbour
    def _edge_count(g, u, v):
        """Return the total number of directed edges between u and v in both directions."""
        fwd = g.number_of_edges(u, v)
        rev = g.number_of_edges(v, u)
        return fwd + rev

    others_raw = [n for n in subG.nodes if n != central_id]
    strength = {n: max(_edge_count(subG, central_id, n), 1) for n in others_raw}

    # If every neighbour has the same strength (common when data has no parallel
    # edges) fall back to using each node's total degree in the FULL graph so
    # sizes reflect real network connectivity, not just connections to the central node.
    if len(set(strength.values())) == 1:
        degrees = dict(G.degree())
        strength = {n: max(degrees.get(n, 1), 1) for n in others_raw}

    max_strength = max(strength.values()) if strength else 1

    # --- Resolve UniProt IDs to gene names ---
    unknown_ids = [n for n in subG.nodes if looks_like_uniprot_id(n)]
    label_map = batch_uniprot_to_gene(unknown_ids) if unknown_ids else {}
    subG = nx.relabel_nodes(subG, label_map)
    central_name = label_map.get(central_id, central_label)

    # Re-key strength dict after relabelling
    strength = {label_map.get(n, n): v for n, v in strength.items()}

    # --- Weighted radial layout ---
    # Nodes with higher strength sit closer to the centre (min radius 0.8,
    # max radius 2.2).
    others = [n for n in subG.nodes if n != central_name]
    pos = {central_name: (0.0, 0.0)}
    MIN_R, MAX_R = 0.8, 2.2
    for i, node in enumerate(others):
        angle = 2 * math.pi * i / max(len(others), 1)
        s = strength.get(node, 1)
        radius = MAX_R - (MAX_R - MIN_R) * (s - 1) / max(max_strength - 1, 1)
        pos[node] = (math.cos(angle) * radius, math.sin(angle) * radius)

    # --- Node sizes and colours ---
    MIN_SZ, MAX_SZ = 600, 2800
    node_sizes = []
    node_colors = []
    for n in subG.nodes:
        if n == central_name:
            node_sizes.append(3200)
            node_colors.append("#1d4ed8")   # dark blue — central kinase
        else:
            s = strength.get(n, 1)
            size = MIN_SZ + (MAX_SZ - MIN_SZ) * (s - 1) / max(max_strength - 1, 1)
            node_sizes.append(int(size))
            # Colour gradient: light blue → mid blue proportional to strength
            intensity = (s - 1) / max(max_strength - 1, 1)
            r = int(147 - intensity * 80)   # 147→67
            g_ch = int(197 - intensity * 100) # 197→97
            b = int(253 - intensity * 50)   # 253→203
            node_colors.append(f"#{r:02x}{g_ch:02x}{b:02x}")

    # --- Edge widths (bidirectional = thicker) ---
    edge_widths = []
    for u, v in subG.edges():
        if subG.has_edge(v, u):
            edge_widths.append(2.2)   # bidirectional — thicker
        else:
            edge_widths.append(0.9)

    fig, ax = plt.subplots(figsize=(14, 11))
    ax.set_facecolor("#f8fafc")
    fig.patch.set_facecolor("#f8fafc")

    nx.draw_networkx_nodes(
        subG, pos,
        node_color=node_colors,
        node_size=node_sizes,
        ax=ax, alpha=0.93,
    )
    nx.draw_networkx_labels(
        subG, pos,
        font_size=7.5,
        font_color="white",
        font_weight="bold",
        ax=ax,
    )
    nx.draw_networkx_edges(
        subG, pos,
        edge_color="#94a3b8",
        arrows=True,
        arrowsize=14,
        arrowstyle="-|>",
        connectionstyle="arc3,rad=0.10",
        ax=ax,
        node_size=node_sizes,
        width=edge_widths,
        alpha=0.75,
    )

    # --- Legend ---
    from matplotlib.lines import Line2D
    legend_elements = [
        Line2D([0], [0], marker="o", color="w", markerfacecolor="#1d4ed8",
               markersize=13, label=f"{central_name} (queried)"),
        Line2D([0], [0], marker="o", color="w", markerfacecolor="#93c5fd",
               markersize=9,  label="Weakly related"),
        Line2D([0], [0], marker="o", color="w", markerfacecolor="#4365c3",
               markersize=11, label="Strongly related"),
        Line2D([0], [0], color="#94a3b8", linewidth=2.2,
               label="Bidirectional interaction"),
    ]
    ax.legend(handles=legend_elements, loc="lower left", fontsize=8,
              framealpha=0.85, edgecolor="#e2e8f0")

    ax.set_title(
        f"Kinase Interaction Network — {central_name}\n"
        f"Node size & proximity = interaction strength with {central_name}",
        fontsize=12, fontweight="bold", pad=14,
    )
    ax.axis("off")
    fig.tight_layout()

    abs_path = _save_static(_build_output_name("network", title or central_name))
    fig.savefig(abs_path, dpi=220, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)

    return _public_url_for(abs_path)


def plot_ksea_heatmap(matrix, kinase_labels, perturbation_labels, title=None):
    """Draw a heatmap of KSEA z-scores with kinases on the Y-axis and perturbations on the X-axis.

    Each cell is coloured on a red–white–blue diverging scale:
    blue = activated (positive z-score), red = inhibited (negative z-score),
    light grey = no data available for that combination.

    The numeric z-score is printed inside each cell for readability.

    Parameters
    ----------
    matrix : dict
        Mapping of ``(kinase_label, perturbation_label)`` tuples to z-score floats.
    kinase_labels : list[str]
        Ordered list of kinase names (row labels).
    perturbation_labels : list[str]
        Ordered list of perturbation names (column labels).

    Returns
    -------
    str
        Relative path to the saved image (``"static/ksea_heatmap.png"``).
    """
    import numpy as np

    import numpy as np
    import matplotlib.cm as cm
    import matplotlib.colors as mcolors

    # Drop perturbations that are entirely NaN across all kinases (all-grey columns)
    perturbation_labels = [
        p for p in perturbation_labels
        if any(not np.isnan(matrix.get((k, p), np.nan)) for k in kinase_labels)
    ]
    # Drop kinases that are entirely NaN across all perturbations (all-grey rows)
    kinase_labels = [
        k for k in kinase_labels
        if any(not np.isnan(matrix.get((k, p), np.nan)) for p in perturbation_labels)
    ]

    if not perturbation_labels or not kinase_labels:
        # Nothing survived filtering — return a minimal placeholder image
        fig, ax = plt.subplots(figsize=(7, 3))
        ax.text(0.5, 0.5, "No KSEA data available for the requested combinations.",
                ha="center", va="center", fontsize=11, color="#6b7280", transform=ax.transAxes)
        ax.axis("off")
        abs_path = _save_static(_build_output_name("ksea-heatmap", title or "empty-heatmap"))
        fig.savefig(abs_path, dpi=220, bbox_inches="tight", facecolor=fig.get_facecolor())
        plt.close(fig)
        return _public_url_for(abs_path)

    # Build a 2-D float array; NaN where no data exists
    grid = np.array(
        [
            [matrix.get((k, p), np.nan) for p in perturbation_labels]
            for k in kinase_labels
        ],
        dtype=float,
    )

    n_rows = len(kinase_labels)
    n_cols = len(perturbation_labels)
    fig_w = max(12, n_cols * 1.9)
    fig_h = max(6.5, n_rows * 1.35)
    fig, ax = plt.subplots(figsize=(fig_w, fig_h))

    # Diverging colour scale centred at 0
    finite_vals = grid[~np.isnan(grid)]
    vmax = float(np.max(np.abs(finite_vals))) if finite_vals.size else 3.0
    cmap = cm.RdBu
    norm = mcolors.Normalize(vmin=-vmax, vmax=vmax)

    # Draw every cell as a coloured Rectangle — avoids imshow dtype constraints
    for i in range(n_rows):
        for j in range(n_cols):
            val = grid[i, j]
            if np.isnan(val):
                ax.add_patch(
                    plt.Rectangle(
                        (j - 0.5, i - 0.5), 1, 1,
                        facecolor="#e5e7eb", edgecolor="white", lw=0.6,
                    )
                )
                ax.text(j, i, "n/a", ha="center", va="center",
                        fontsize=7, color="#9ca3af")
            else:
                colour = cmap(norm(val))
                ax.add_patch(
                    plt.Rectangle(
                        (j - 0.5, i - 0.5), 1, 1,
                        facecolor=colour, edgecolor="white", lw=0.6,
                    )
                )
                text_colour = "white" if abs(val) > vmax * 0.55 else "#111827"
                ax.text(j, i, f"{val:.2f}", ha="center", va="center",
                        fontsize=7.5, color=text_colour, fontweight="bold")

    # Axis limits, labels, ticks
    ax.set_xlim(-0.5, n_cols - 0.5)
    ax.set_ylim(-0.5, n_rows - 0.5)
    ax.invert_yaxis()   # first kinase at the top
    ax.set_xticks(range(n_cols))
    ax.set_xticklabels(perturbation_labels, rotation=40, ha="right", fontsize=9)
    ax.set_yticks(range(n_rows))
    ax.set_yticklabels(kinase_labels, fontsize=9)
    ax.tick_params(length=0)

    # Colourbar via ScalarMappable (no imshow required)
    sm = cm.ScalarMappable(cmap=cmap, norm=norm)
    sm.set_array([])
    cbar = fig.colorbar(sm, ax=ax, label="KSEA Z-score", shrink=0.75, pad=0.02)
    cbar.ax.tick_params(labelsize=8)

    for spine in ax.spines.values():
        spine.set_visible(False)

    ax.set_title(
        "Kinase Activity Heatmap — KSEA Z-scores\n"
        "Blue = activated · Red = inhibited · Grey = no data",
        fontsize=11, fontweight="bold", pad=12,
    )

    fig.tight_layout()
    abs_path = _save_static(_build_output_name("ksea-heatmap", title or "ksea-heatmap"))
    fig.savefig(abs_path, dpi=260, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    return _public_url_for(abs_path)


def plot_ksea_radar(data, protein_label, title=None):
    """Draw a radar / spider chart showing one kinase's KSEA activity across perturbations.

    Each axis of the radar represents one perturbation.  The dashed circle marks
    the zero baseline (no change).  Points outside the circle = kinase activated
    under that perturbation; points inside = inhibited.

    Because radar charts require non-negative radii, all z-scores are shifted up
    by ``vmax`` so that:
      - the outer ring  = +vmax  (strongly activated)
      - the dashed ring = 0      (no change)
      - the centre      = -vmax  (strongly inhibited)

    The actual z-score is annotated next to each vertex so the original values
    remain readable.

    Parameters
    ----------
    data : list[dict]
        Records with keys ``"perturbation"`` and ``"z_score"``.
    protein_label : str
        Display name for the kinase (used in the chart title).

    Returns
    -------
    str
        Relative path to the saved image (``"static/ksea_radar.png"``).
    """
    import numpy as np

    # Resolve protein label if it's a UniProt ID
    label_map = _resolve_labels([protein_label])
    protein_label = label_map.get(protein_label, protein_label)

    rows = sorted(data, key=lambda r: r["perturbation"])
    labels = [r["perturbation"] for r in rows]
    scores = [float(r["z_score"]) for r in rows]
    N = len(labels)

    if N < 3:
        # Radar needs at least 3 axes to be meaningful
        return plot_ksea_conditions(data, protein_label, title=title)

    # --- Shift so the zero line sits at radius = vmax ---
    vmax = max(abs(s) for s in scores)
    vmax = max(vmax, 0.5)          # minimum range so chart isn't degenerate
    shifted = [s + vmax for s in scores]

    # Close the polygon by repeating the first value
    angles = [2 * 3.14159 * i / N for i in range(N)]
    angles_closed = angles + [angles[0]]
    shifted_closed = shifted + [shifted[0]]

    fig, ax = plt.subplots(figsize=(10, 10), subplot_kw={"polar": True})
    ax.set_facecolor("#f8fafc")
    fig.patch.set_facecolor("#f8fafc")

    # --- Filled polygon ---
    ax.plot(angles_closed, shifted_closed, "o-", linewidth=2.0,
            color="#2563eb", zorder=4)
    ax.fill(angles_closed, shifted_closed, alpha=0.20, color="#2563eb", zorder=3)

    # --- Zero baseline circle (dashed) ---
    import numpy as np_inner
    theta_ring = np_inner.linspace(0, 2 * 3.14159, 200)
    ax.plot(theta_ring, [vmax] * 200, linestyle="--", linewidth=1.2,
            color="#374151", alpha=0.6, zorder=2)

    # --- Concentric reference rings at ±½ vmax and ±vmax ---
    for r_offset, colour in [(vmax * 0.5, "#d1d5db"), (vmax * 1.5, "#d1d5db")]:
        ax.plot(theta_ring, [r_offset] * 200, linestyle=":",
                linewidth=0.7, color=colour, zorder=1)

    # --- Annotate each vertex with its z-score ---
    for angle, r, score in zip(angles, shifted, scores):
        label_r = r + vmax * 0.18
        colour = "#dc2626" if score < 0 else "#1d4ed8"
        sign = "+" if score >= 0 else ""
        ax.text(angle, label_r, f"{sign}{score:.2f}",
                ha="center", va="center", fontsize=8,
                color=colour, fontweight="bold",
                bbox=dict(boxstyle="round,pad=0.2", facecolor="white",
                          edgecolor=colour, alpha=0.85))

    # --- Axis labels (perturbation names) ---
    ax.set_xticks(angles)
    ax.set_xticklabels(labels, fontsize=9, color="#111827")

    # --- Radial axis: hide default ticks, add custom labels ---
    ax.set_ylim(0, vmax * 2)
    ax.set_yticks([0, vmax * 0.5, vmax, vmax * 1.5, vmax * 2])
    ax.set_yticklabels(
        [f"−{vmax:.1f}", f"−{vmax*0.5:.1f}", "0", f"+{vmax*0.5:.1f}", f"+{vmax:.1f}"],
        fontsize=7.5, color="#6b7280",
    )
    ax.yaxis.set_tick_params(labelsize=7.5)

    # --- Legend patches ---
    from matplotlib.patches import Patch
    legend_elements = [
        Patch(facecolor="#2563eb", alpha=0.3, label="Activated (outside dashed ring)"),
        Patch(facecolor="#dc2626", alpha=0.3, label="Inhibited (inside dashed ring)"),
    ]
    ax.legend(handles=legend_elements, loc="upper right",
              bbox_to_anchor=(1.35, 1.12), fontsize=8, framealpha=0.9)

    ax.set_title(
        f"{protein_label} — KSEA Activity Radar\n"
        "Dashed ring = baseline (z = 0)  ·  Outside = activated  ·  Inside = inhibited",
        fontsize=11, fontweight="bold", pad=22,
    )
    ax.grid(color="#e2e8f0", linewidth=0.6)

    fig.tight_layout()
    abs_path = _save_static(_build_output_name("ksea-radar", title or protein_label))
    fig.savefig(abs_path, dpi=220, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    return _public_url_for(abs_path)


def plot_ksea_conditions(data, protein_label, title=None):
    """Draw a bar chart comparing a single kinase's KSEA z-score across multiple perturbations.
    Bars are sorted from most activated to most inhibited.
    P-values are shown on the bars where KINEPIK provides them."""
    rows = sorted(data, key=lambda r: r["z_score"], reverse=True)

    # Resolve protein label if it's a UniProt ID
    label_map = _resolve_labels([protein_label])
    protein_label = label_map.get(protein_label, protein_label)

    perturbations = [row["perturbation"] for row in rows]
    scores = [row["z_score"] for row in rows]
    colors = ["#2563eb" if score >= 0 else "#dc2626" for score in scores]

    fig, ax = plt.subplots(figsize=(12, 6.5))
    bars = ax.bar(perturbations, scores, color=colors, edgecolor="white", linewidth=0.6, zorder=3)
    ax.axhline(0, color="#374151", linewidth=0.9, zorder=4)
    _style_ax(ax)

    for bar, row in zip(bars, rows):
        z = row["z_score"]
        p_value = row.get("p_value")
        label = f"{z:.2f}"
        if p_value is not None:
            label += f"\np={p_value:.2g}"
        va = "bottom" if z >= 0 else "top"
        offset = 0.05 if z >= 0 else -0.05
        ax.text(
            bar.get_x() + bar.get_width() / 2,
            z + offset,
            label,
            ha="center",
            va=va,
            fontsize=7.5,
            color="#111827",
        )

    ax.set_ylabel("KSEA Z-score", fontsize=11)
    ax.set_title(f"{protein_label} KSEA Activity Across Perturbations", fontsize=12, fontweight="bold", pad=10)
    plt.xticks(rotation=40, ha="right")
    fig.tight_layout()

    abs_path = _save_static(_build_output_name("ksea-conditions", title or protein_label))
    fig.savefig(abs_path, dpi=220, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    return _public_url_for(abs_path)


def main():
    payload = {}
    args = sys.argv[1:]
    if "--payload" in args:
        idx = args.index("--payload")
        if idx + 1 < len(args):
            try:
                payload = json.loads(args[idx + 1])
            except json.JSONDecodeError:
                payload = {}

    chart_type = payload.get("type")
    data = payload.get("data") or []
    perturbation = payload.get("perturbation")
    direction = payload.get("direction")
    title = payload.get("title")
    kinase_label = payload.get("kinaseLabel")
    kinase_names = payload.get("kinaseNames") or []
    connection_counts = payload.get("connectionCounts") or []
    family_labels = payload.get("familyLabels") or []
    perturbation_labels = payload.get("perturbationLabels") or []
    kinase_labels = payload.get("kinaseLabels") or []
    matrix = payload.get("matrix") or {}
    kinase_id = payload.get("kinaseId")

    if chart_type == "ksea-bar":
        result = plot_ksea(data, perturbation=perturbation, direction=direction, title=title)
    elif chart_type == "ksea-heatmap":
        result = plot_ksea_heatmap(matrix, kinase_labels, perturbation_labels, title=title)
    elif chart_type == "ksea-radar":
        result = plot_ksea_radar(data, kinase_label or title or "kinase", title=title)
    elif chart_type == "top-connected":
        result = plot_top_connected_kinases(kinase_names, connection_counts, title=title)
    elif chart_type == "connectivity-heatmap":
        result = plot_connectivity_heatmap(kinase_names, family_labels, connection_counts, title=title)
    elif chart_type == "network":
        result = plot_network(data, title or kinase_label or "kinase", kinase_id=kinase_id, title=title)
    else:
        result = None

    if result:
        print(result)


if __name__ == "__main__":
    main()