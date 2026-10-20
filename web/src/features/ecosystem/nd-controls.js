export const MAX_NETWORK_DIMENSIONS=32
export function networkNDControls(){
 return `<fieldset><legend>N-dimensional relationship network</legend>
 <label>Computed dimensions <input id="network-dimensions" type="number" min="4" max="${MAX_NETWORK_DIMENSIONS}" step="1" value="4"></label>
 <label>Displayed dimensions <select id="display-dimensions"><option value="3">3D</option><option value="2">2D</option></select></label>
 <label>Projection <select id="projection-algorithm"><option value="perspective">Rotated perspective</option><option value="orthographic">Rotated orthographic</option><option value="pca">PCA — principal components</option><option value="random">Seeded random projection</option><option value="radial">Radial shell</option><option value="slice">Dimensional slice</option></select></label>
 <div data-projection-option="pca" hidden><button id="projection-refit" type="button">Refit PCA</button><p>PCA axes stay fixed while particles move. Refit to update.</p></div>
 <label data-projection-option="random" hidden>Projection seed <input id="projection-seed" type="number" min="0" max="4294967295" step="1" value="1"></label>
 <label data-projection-option="slice" hidden>Slice thickness <input id="projection-slice-width" type="number" min="1" max="1200" step="1" value="100"></label>
 <label>Viewing axis <select id="projection-axis">${Array.from({length:MAX_NETWORK_DIMENSIONS-3},(_,i)=>`<option value="${i+3}">Dimension ${i+4}</option>`).join('')}</select></label>
 <p>Position on viewing axis: <output id="life-w-position">0.00</output></p>
 ${Array.from({length:MAX_NETWORK_DIMENSIONS-3},(_,i)=>`<div data-projection-axis="${i+3}" ${i?'hidden':''}>${['X','Y','Z'].map((axis,k)=>`<label class="eco-slider-row"><span class="eco-slider-name">${axis} / ${i+4} rotation</span><input id="projection-${i+3}-${k}" type="range" min="-180" max="180" step="1" value="0"><span class="eco-slider-value"><output id="projection-${i+3}-${k}-value">0</output>°</span></label>`).join('')}</div>`).join('')}
 <label class="eco-slider-row" data-projection-option="perspective"><span class="eco-slider-name">Projection perspective</span><input id="life-perspective" type="range" min="0" max="0.8" step="0.01" value="0.35"><span class="eco-slider-value"><output id="life-perspective-value">0.35</output></span></label>
 <label>Repulsion radius <input id="life-radius" type="number" min="50" max="600" step="10" value="300"></label>
 <label>Velocity retention <input id="life-friction" type="number" min="0.1" max="0.98" step="0.01" value="0.85"></label>
 </fieldset>`
}
