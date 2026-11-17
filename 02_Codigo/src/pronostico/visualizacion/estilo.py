"""Estilo común de figuras (formato IEEE, una columna ≈ 3,4 in, 8 pt).

Paleta categórica en orden fijo (nunca cíclico), validada para daltonismo
en sus tres primeras posiciones; grillas y ejes recesivos; un solo eje Y.
"""
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"]
TEXTO = "#0b0b0b"
SECUNDARIO = "#52514e"
GRILLA = "#d9d8d4"
ANCHO_COL = 3.45
ANCHO_DOBLE = 7.0


def aplicar():
    plt.rcParams.update({
        "font.family": "serif", "font.serif": ["Times New Roman", "Liberation Serif", "DejaVu Serif"],
        "font.size": 8, "axes.titlesize": 8, "axes.labelsize": 8, "legend.fontsize": 7,
        "xtick.labelsize": 7, "ytick.labelsize": 7, "axes.edgecolor": SECUNDARIO,
        "axes.labelcolor": TEXTO, "xtick.color": SECUNDARIO, "ytick.color": SECUNDARIO,
        "axes.grid": True, "grid.color": GRILLA, "grid.linewidth": 0.5,
        "axes.spines.top": False, "axes.spines.right": False, "lines.linewidth": 1.4,
        "lines.markersize": 4, "legend.frameon": False, "figure.dpi": 300, "savefig.dpi": 300,
        "savefig.bbox": "tight", "savefig.pad_inches": 0.02, "axes.prop_cycle": plt.cycler(color=SERIES),
    })


MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]


def formato_mes(ax):
    """Etiquetas de fecha en español (mes-año) sin depender del locale del sistema."""
    import matplotlib.dates as mdates
    from matplotlib.ticker import FuncFormatter
    ax.xaxis.set_major_locator(mdates.MonthLocator(bymonth=(1, 7)))
    ax.xaxis.set_major_formatter(FuncFormatter(
        lambda x, _: (lambda d: f"{MESES[d.month - 1]}-{d:%y}")(mdates.num2date(x))))


def comas(ax, eje="y"):
    """Separador decimal con coma (convención del documento en español)."""
    from matplotlib.ticker import FuncFormatter
    f = FuncFormatter(lambda v, _: f"{v:g}".replace(".", ","))
    (ax.yaxis if eje == "y" else ax.xaxis).set_major_formatter(f)


def c(x, d=2):
    return f"{x:.{d}f}".replace(".", ",")
