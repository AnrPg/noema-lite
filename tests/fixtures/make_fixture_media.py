"""Regenerates the demo-physics test picture (tests only)."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'tools'))
from svgkit import Diagram, write_registry
d = Diagram(800, 420, title='A thermal power station')
d.box('fuel', 30, 90, 130, 70, 'Fuel', sub='chemical energy', color='orange', accept=['coal', 'gas'])
d.box('boiler', 220, 90, 140, 70, 'Boiler', sub='heat → steam', color='red')
d.box('turbine', 420, 90, 140, 70, 'Turbine', sub='steam → rotation', color='blue')
d.box('generator', 620, 90, 150, 70, 'Generator', sub='rotation → electricity', color='violet', accept=['dynamo'])
d.arrow('fuel', 'boiler'); d.arrow('boiler', 'turbine'); d.arrow('turbine', 'generator')
d.raw('<circle cx="140" cy="300" r="55" fill="#fff6d6" stroke="#e0a800" stroke-width="2"/>')
d.text(140, 300, 'Sun', size=18, weight=700, anchor='middle')
d.raw('<polygon points="560,250 760,250 720,380 600,380" fill="#ddf6f3" stroke="#12a5a0" stroke-width="2"/>')
d.text(660, 315, 'Cooling tower', size=16, weight=700, anchor='middle')
d.box('grid', 300, 270, 160, 70, 'Grid', sub='to the homes', color='green')
d.arrow('generator', 'grid')
it = d.save(os.path.join(os.path.dirname(__file__), 'demo-physics', 'media'), 'power-station', alt='Block diagram of a thermal power station: fuel, boiler, turbine, generator, grid, a sun and a cooling tower', caption='Energy changes form at every stage.', src='s1')
it['regions'] += [{'id': 'sun', 'shape': 'circle', 'cx': 140, 'cy': 300, 'r': 55, 'label': 'Sun', 'note': 'Not part of the station.'},
                  {'id': 'tower', 'shape': 'poly', 'points': [[560, 250], [760, 250], [720, 380], [600, 380]], 'label': 'Cooling tower', 'q': 'What gets rid of the waste heat?'}]
write_registry(os.path.join(os.path.dirname(__file__), 'demo-physics', 'media'), [it])

# a function graph (svgkit.Plot) — tests the "plot" origin and curve regions
from svgkit import Plot
p = Plot(800, 480, xr=(0, 5), yr=(0, 26), title='A 2 kg ball: energy and momentum vs speed', xlabel='v (m/s)', ylabel='value')
p.grid(); p.axes()
p.curve('ek', lambda v: v * v, color='blue', label='Kinetic energy (J)', note='Eₖ = ½·m·v² = v² for m = 2 kg: a parabola.', tag='Eₖ', tag_at=(4.6, 21.16))
p.curve('mom', lambda v: 2 * v, color='orange', label='Momentum (kg·m/s)', note='p = m·v = 2v: a straight line.', tag='p', tag_at=(4.6, 9.2))
p.point('v3', 3, 9, label='v = 3 m/s → Eₖ = 9 J', note='½ · 2 · 3² = 9 J')
it2 = p.save(os.path.join(os.path.dirname(__file__), 'demo-physics', 'media'), 'ek-graph', alt='Graph of kinetic energy (a parabola, v squared) and momentum (a straight line, 2v) of a 2 kg ball for speeds 0 to 5 m/s, with a marked point at v = 3 m/s, 9 J.', caption='Double the speed → four times the energy, but only twice the momentum.', src='s1')
write_registry(os.path.join(os.path.dirname(__file__), 'demo-physics', 'media'), [it2])
