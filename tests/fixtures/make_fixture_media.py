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
