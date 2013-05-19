var SCPoint = function(x, y) {
	this.x = x;
	this.y = y;
	return this;
}

function StarCanvas($canvas) {

	this.imageCache = {};
	this.sectorSize = 20.0; // Lightyears
	this.baseScale = 10.0; // Pixels per lightyear

	this.sectorZoomMin = 0.33; // Only draw sectors from this zoomlevel on

	this.scale = 1.0;  // Zoom

	this.jqCanvas = $canvas;
	this.offsetX = 0;
	this.offsetY = 0;
	this.lastCoord = new SCPoint(0,0);
	this.canvas = $canvas[0];
	this.width = $canvas.parent().width();
	this.height = this.canvas.height;
	this.canvas.width = this.width; // autoresize canvas to fit parent width
	this.selectedSector = null;

	this.listeners = {
		'gridClicked': [],
	};

	this.backgrounds = [];
	this.initMouseListeners();
	this.initZooming();
	this.jqCanvas.bind("selectstart", function() { return false; }); // disable text selection

	return this;
}
StarCanvas.prototype.init = function() {
	var self = this;
	for (i=0;i<this.backgrounds.length;i++) {
		var bg = this.backgrounds[i];
		var bgImage = this.getCachedImage(bg.url);
		if (!bgImage) {
			self.loadImage(bg.url);
		}
	}
	this.draw();
}
StarCanvas.prototype.getCachedImage = function(imgName) {
	return this.imageCache[imgName];
}
StarCanvas.prototype.setCachedImage = function(imgName, img) {
	this.imageCache[imgName] = img;
}
StarCanvas.prototype.loadImage = function(imageUrl) {
	var self = this;
	var img = new Image();
	img.src = imageUrl;
	img.onload = function() {
		self.setCachedImage(imageUrl, img);
		self.draw();
	}
}
StarCanvas.prototype.initZooming = function() {
	var self = this;
	this.jqCanvas.bind('mousewheel', function(event, delta, deltaX, deltaY) {
		event.preventDefault();
		var scaleDiff = delta < 0 ? 0.9 : 1.1;
		self.scale *= scaleDiff;
		var zoomRound = 4000.0;
		self.scale = Math.round(self.scale * zoomRound) / zoomRound;
		console.log("New scale: " + self.scale);
		self.draw();
	});
}
StarCanvas.prototype.initMouseListeners = function() {
	var self = this;

	function onDragEnd(){
		self.jqCanvas.unbind("mousemove", onDragging);
		self.jqCanvas.unbind("mouseup", onDragEnd);
		
		if (!self.dragging) {
			// a click event happened, we should parse
			if (event.which != 1) return; // only left mouse click
			if (self.selectedSector) {
				self.fireGridClicked(self.selectedSector.x, self.selectedSector.y);
			}
		}
		self.dragging = false;
	};

	function onDragStart(event) {
		self.dragging = false; // until coords change
		self.lastCoord.x = event.clientX;
		self.lastCoord.y = event.clientY;
		self.jqCanvas.bind("mouseup", event.data, onDragEnd);
		self.jqCanvas.bind("mousemove", event.data, onDragging);
	}

	function onDragging(event){
		var delta = new SCPoint(event.clientX - self.lastCoord.x, event.clientY - self.lastCoord.y);
		self.offsetX -= Math.floor(delta.x / self.scale);
		self.offsetY -= Math.floor(delta.y / self.scale);
		self.lastCoord.x = event.clientX;
		self.lastCoord.y = event.clientY;
		self.draw();
	}

	function onMouseMove(event){
		// check if we're in a sector, mark as selected
		self.dragging = true;
		var p = new SCPoint(event.pageX, event.pageY);
		p.x -= this.offsetLeft;
		p.y -= this.offsetTop;

		var gp = self.getGridPointAt(p);
		if (!self.selectedSector || (gp.x != self.selectedSector.x || gp.y != self.selectedSector.y)) {
			self.selectedSector = new SCPoint();
			self.selectedSector.x = gp.x;
			self.selectedSector.y = gp.y;
			self.draw();
		}
	}

	function onMouseLeave(event) {
		// deselect grid and disable dragging
		self.jqCanvas.unbind("mousemove", onDragging);
		self.jqCanvas.unbind("mouseup", onDragEnd);
		self.selectedSector = null;
		self.draw();
	}

	this.jqCanvas.bind('mousedown', onDragStart);
	this.jqCanvas.bind('mouseleave', onMouseLeave);
	this.jqCanvas.bind('mousemove', onMouseMove);
}
StarCanvas.prototype.getGridPointAt = function(clickPoint) {
	var p = this.getPixelPointAt(clickPoint);
	//convert to grid point
	p.x = Math.floor(p.x / this.sectorSize);
	p.y = Math.floor(p.y / this.sectorSize);
	return p;
}
StarCanvas.prototype.getPixelPointAt = function(clickPoint) {
	var p = new SCPoint(clickPoint.x, clickPoint.y);
	//console.log("C: " + p.x+","+p.y);
	p.x = p.x / this.scale;
	p.y = p.y / this.scale;
	//console.log("S: " + p.x+","+p.y);
	p.x += this.offsetX;
	p.y += this.offsetY;
	//console.log("O: " + p.x+","+p.y);
	p.x = p.x / this.baseScale;
	p.y = p.y / this.baseScale;
	//console.log("B: " + p.x+","+p.y);
	return p;
}
StarCanvas.prototype.draw = function() {
	var ctx = this.canvas.getContext('2d');
	ctx.clearRect(0, 0, this.width, this.height);
	ctx.save();
	for (i=0;i<this.backgrounds.length;i++) {
		this.drawBackground(ctx, this.backgrounds[i]);
	}
	ctx.restore();

	ctx.save();
	ctx.scale(this.scale, this.scale);
	if (this.scale > this.sectorZoomMin) {
		this.drawGrids(ctx);
	}
	ctx.restore();
}
StarCanvas.prototype.drawBackground = function(ctx, bg) {
	if (this.scale < bg.scaleMin || this.scale > bg.scaleMax) {
		return;
	}

	var bgImage = this.getCachedImage(bg.url);
	if (!bgImage) {
		return;
	}

	ctx.save();
	//calculate base scale, alpha
	var alpha = 1.0;
	if (this.scale < bg.baseScale) {
		var scaleRange = bg.baseScale - bg.scaleMin;
		var rangePos = this.scale - bg.scaleMin;
		var rangePosPerc = rangePos / scaleRange;
		var alphaRange = 1.0 - bg.alphaAtMin;
		alpha = bg.alphaAtMin + (alphaRange * rangePosPerc);
	} else {
		var scaleRange = bg.scaleMax - bg.baseScale;
		var rangePos = this.scale - bg.baseScale;
		var rangePosPerc = 1.0 - (rangePos / scaleRange);
		var alphaRange = 1.0 - bg.alphaAtMax;
		alpha = bg.alphaAtMax + (alphaRange * rangePosPerc);
	}

	if (alpha >= -0.01 && alpha <= 0.01) { return; }
	ctx.globalAlpha = alpha;

	var bgWidth = bgImage.width * bg.imgScale;
	var bgHeight = bgImage.height * bg.imgScale;
	var bgScale = bg.imgScale * this.scale;

	ctx.scale(bgScale, bgScale);
	
	if (bg.repeat) {
		var bgPattern = ctx.createPattern(bgImage, "repeat");
		ctx.fillStyle = bgPattern;
		var bgx = this.offsetX % bgWidth;
		var bgy = this.offsetY % bgHeight;
		if (bgx < 0) { bgx += bgWidth; }
		if (bgy < 0) { bgy += bgHeight; }
		bgx /= bg.imgScale;
		bgy /= bg.imgScale;
	
		var fillWidth = bgx + (this.width / this.scale);
		var fillHeight = bgy + (this.height / this.scale);
	
		ctx.translate(-bgx, -bgy);
		ctx.fillRect(0, 0, fillWidth, fillHeight);
	}
	else {
		//background is nonrepeating; center it and draw
		ctx.translate(-this.offsetX / bg.imgScale, -this.offsetY / bg.imgScale);
		ctx.drawImage(bgImage, -bgImage.width/2, -bgImage.height/2);
	}
	ctx.globalAlpha = 1.0;
	ctx.restore();
}
StarCanvas.prototype.drawGrids = function(ctx) {
	var sectorDrawSize = this.sectorSize * this.baseScale;
	var xDrawGrids = (this.width / sectorDrawSize) / this.scale;
	var yDrawGrids = (this.height / sectorDrawSize) / this.scale;

	var xo = this.offsetX % sectorDrawSize;
	var yo = this.offsetY % sectorDrawSize;

	ctx.save();
	ctx.translate(-this.offsetX, -this.offsetY);

	for (var x=-1;x<xDrawGrids+2;x++) {
		for (var y=-1;y<yDrawGrids+2;y++) {
			var realX = Math.floor((this.offsetX + (x * sectorDrawSize)) / sectorDrawSize);
			var realY = Math.floor((this.offsetY + (y * sectorDrawSize)) / sectorDrawSize);

			if (xo) { realX += 1; }
			if (yo) { realY += 1; }

			var selected = this.selectedSector && this.selectedSector.x == realX && this.selectedSector.y == realY;

			ctx.save();
			ctx.translate(realX * sectorDrawSize, realY * sectorDrawSize);

			ctx.strokeStyle = "#7f552b";
			var qs = sectorDrawSize / 3;

			//ctx.strokeRect(0, 0, sectorDrawSize-1, sectorDrawSize-1);
			ctx.beginPath();
			ctx.moveTo(0, 0);
			ctx.lineTo(0, qs);
			ctx.moveTo(0, 0);
			ctx.lineTo(qs, 0);

			ctx.moveTo(sectorDrawSize, 0);
			ctx.lineTo(sectorDrawSize-qs, 0);
			ctx.moveTo(sectorDrawSize, 0);
			ctx.lineTo(sectorDrawSize, qs);

			ctx.moveTo(0, sectorDrawSize);
			ctx.lineTo(0, sectorDrawSize-qs);
			ctx.moveTo(0, sectorDrawSize);
			ctx.lineTo(qs, sectorDrawSize);

			ctx.moveTo(sectorDrawSize, sectorDrawSize);
			ctx.lineTo(sectorDrawSize, sectorDrawSize-qs);
			ctx.moveTo(sectorDrawSize, sectorDrawSize);
			ctx.lineTo(sectorDrawSize-qs, sectorDrawSize);
			ctx.stroke();

			//draw sector position
			ctx.fillStyle = "#FFF";
			ctx.font = '20px lcars';
			var text = realX+"."+realY;
			var metrics = ctx.measureText(text);
			var textPosX = (sectorDrawSize - metrics.width) - 4;
			var textPosY = sectorDrawSize - 4;
			ctx.fillText(text, textPosX, textPosY);

			if (selected) {
				ctx.globalCompositeOperation = "lighter";
				ctx.fillStyle = 'rgba(200, 200, 200, 0.3)';
				ctx.fillRect(0, 0, sectorDrawSize, sectorDrawSize);
			}

			ctx.restore();
		}
	}
	ctx.restore();
}
StarCanvas.prototype.fireGridClicked = function(gridX, gridY) {
	$.each(this.listeners["gridClicked"], function(index, listenerFunction) {
		listenerFunction(gridX, gridY);
	});
}
StarCanvas.prototype.bind = function(type, listener) {
	var myList = this.listeners[type];
	if (myList.indexOf(listener) < 0) {
		myList.push(listener);
	}
}
StarCanvas.prototype.unbind = function(type, listener) {
	if ($.inArray(listener, this.listeners[type])) {
		this.listeners[type].pop(listener);
	}
}
