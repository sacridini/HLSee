//This script corrects the BRDF and Topography effect of a L8 and S2 image, surface reflectance product
//Adapted from: Poortinga et al.,2018 https://doi.org/10.3390/rs11070831

// Step 1: BRDF correction
var PI = ee.Number(3.14159265359);
var MAX_SATELLITE_ZENITH = 7.5;
var MAX_DISTANCE = 1000000;
var UPPER_LEFT = 0;
var LOWER_LEFT = 1;
var LOWER_RIGHT = 2;
var UPPER_RIGHT = 3;

//Step 2:  Topographic correction
var scale = 30;
var dem = ee.Image("USGS/SRTMGL1_003");
var degree2radian = 0.01745;


//Global functions
//BRDF correction
//Source: https://doi.org/10.3390/rs11070831
function apply_brdf_landsat(image){
  var date = image.date();
  var footprint = ee.List(image.geometry().bounds().bounds().coordinates().get(0));
  var angles =  get_sun_angles(date, footprint);
  var sunAz = angles[0];
  var sunZen = angles[1];
  var viewAz = azimuth(footprint);
  var viewZen = zenith(footprint);
  var kval = _kvol(sunAz, sunZen, viewAz, viewZen);
  var kvol = kval[0];
  var kvol0 = kval[1];
  var result = _apply_landsat(image, kvol.multiply(PI), kvol0.multiply(PI));
  
  return result;
}

function apply_brdf_sentinel(image){
  var date = image.date();
  var footprint = ee.List(image.geometry().bounds().bounds().coordinates().get(0));
  var angles =  get_sun_angles(date, footprint);
  var sunAz = angles[0];
  var sunZen = angles[1];
  var viewAz = azimuth(footprint);
  var viewZen = zenith(footprint);
  var kval = _kvol(sunAz, sunZen, viewAz, viewZen);
  var kvol = kval[0];
  var kvol0 = kval[1];
  var result = _apply_sentinel(image, kvol.multiply(PI), kvol0.multiply(PI));
  
  return result;
}

function get_sun_angles(date, footprint){
  var jdp = date.getFraction('year');
  var seconds_in_hour = 3600;
  var  hourGMT = ee.Number(date.getRelative('second', 'day')).divide(seconds_in_hour);
    
  var latRad = ee.Image.pixelLonLat().select('latitude').multiply(PI.divide(180));
  var longDeg = ee.Image.pixelLonLat().select('longitude');
    
  // Julian day proportion in radians
  var jdpr = jdp.multiply(PI).multiply(2);
    
  var a = ee.List([0.000075, 0.001868, 0.032077, 0.014615, 0.040849]);
  var meanSolarTime = longDeg.divide(15.0).add(ee.Number(hourGMT));
  var localSolarDiff1 = value(a, 0)
          .add(value(a, 1).multiply(jdpr.cos())) 
          .subtract(value(a, 2).multiply(jdpr.sin())) 
          .subtract(value(a, 3).multiply(jdpr.multiply(2).cos())) 
          .subtract(value(a, 4).multiply(jdpr.multiply(2).sin()));

  var localSolarDiff2 = localSolarDiff1.multiply(12 * 60);
  
  var localSolarDiff = localSolarDiff2.divide(PI);
  var trueSolarTime = meanSolarTime 
          .add(localSolarDiff.divide(60)) 
          .subtract(12.0);
    
  // Hour as an angle;
  var ah = trueSolarTime.multiply(ee.Number(MAX_SATELLITE_ZENITH * 2).multiply(PI.divide(180))) ;   
  var b = ee.List([0.006918, 0.399912, 0.070257, 0.006758, 0.000907, 0.002697, 0.001480]);
  var delta = value(b, 0) 
        .subtract(value(b, 1).multiply(jdpr.cos())) 
        .add(value(b, 2).multiply(jdpr.sin())) 
        .subtract(value(b, 3).multiply(jdpr.multiply(2).cos())) 
        .add(value(b, 4).multiply(jdpr.multiply(2).sin())) 
        .subtract(value(b, 5).multiply(jdpr.multiply(3).cos())) 
        .add(value(b, 6).multiply(jdpr.multiply(3).sin()));

  var cosSunZen = latRad.sin().multiply(delta.sin()) 
        .add(latRad.cos().multiply(ah.cos()).multiply(delta.cos()));
  var sunZen = cosSunZen.acos();

  // sun azimuth from south, turning west
  var sinSunAzSW = ah.sin().multiply(delta.cos()).divide(sunZen.sin());
  sinSunAzSW = sinSunAzSW.clamp(-1.0, 1.0);
  
  var cosSunAzSW = (latRad.cos().multiply(-1).multiply(delta.sin())
                    .add(latRad.sin().multiply(delta.cos()).multiply(ah.cos()))) 
                    .divide(sunZen.sin());
  var sunAzSW = sinSunAzSW.asin();
  
  sunAzSW = where(cosSunAzSW.lte(0), sunAzSW.multiply(-1).add(PI), sunAzSW);
  sunAzSW = where(cosSunAzSW.gt(0).and(sinSunAzSW.lte(0)), sunAzSW.add(PI.multiply(2)), sunAzSW);
  
  var sunAz = sunAzSW.add(PI);
   // # Keep within [0, 2pi] range
    sunAz = where(sunAz.gt(PI.multiply(2)), sunAz.subtract(PI.multiply(2)), sunAz);
  
  var footprint_polygon = ee.Geometry.Polygon(footprint);
  sunAz = sunAz.clip(footprint_polygon);
  sunAz = sunAz.rename(['sunAz']);
  sunZen = sunZen.clip(footprint_polygon).rename(['sunZen']);
  
  return [sunAz, sunZen];
}

function azimuth(footprint){
  function x(point){return ee.Number(ee.List(point).get(0))}
  function  y(point){return ee.Number(ee.List(point).get(1))}
    
  var upperCenter = line_from_coords(footprint, UPPER_LEFT, UPPER_RIGHT).centroid().coordinates();
  var lowerCenter = line_from_coords(footprint, LOWER_LEFT, LOWER_RIGHT).centroid().coordinates();
  var slope = ((y(lowerCenter)).subtract(y(upperCenter))).divide((x(lowerCenter)).subtract(x(upperCenter)));
  var slopePerp = ee.Number(-1).divide(slope);
  var azimuthLeft = ee.Image(PI.divide(2).subtract((slopePerp).atan()));
  return azimuthLeft.rename(['viewAz']);
}
  
function zenith(footprint){
  var leftLine = line_from_coords(footprint, UPPER_LEFT, LOWER_LEFT);
  var rightLine = line_from_coords(footprint, UPPER_RIGHT, LOWER_RIGHT);
  var leftDistance = ee.FeatureCollection(leftLine).distance(MAX_DISTANCE);
  var rightDistance = ee.FeatureCollection(rightLine).distance(MAX_DISTANCE);
  var viewZenith = rightDistance.multiply(ee.Number(MAX_SATELLITE_ZENITH * 2)) 
        .divide(rightDistance.add(leftDistance)) 
        .subtract(ee.Number(MAX_SATELLITE_ZENITH)) 
        .clip(ee.Geometry.Polygon(footprint)) 
        .rename(['viewZen']);
  return viewZenith.multiply(PI.divide(180));
}

function _apply_sentinel(image, kvol, kvol0){
  var f_iso = 0;
  var f_geo = 0;
  var f_vol = 0;
	var blue = _correct_band(image, 'blue', kvol, kvol0, f_iso=0.0774, f_geo=0.0079, f_vol=0.0372);
	var green = _correct_band(image, 'green', kvol, kvol0, f_iso=0.1306, f_geo=0.0178, f_vol=0.0580);
	var red = _correct_band(image, 'red', kvol, kvol0, f_iso=0.1690, f_geo=0.0227, f_vol=0.0574);
	var re1 = _correct_band(image, 're1', kvol, kvol0, f_iso=0.2085, f_geo=0.0256, f_vol=0.0845);
	var re2 = _correct_band(image, 're2', kvol, kvol0, f_iso=0.2316, f_geo=0.0273, f_vol=0.1003);
	var re3 = _correct_band(image, 're3', kvol, kvol0, f_iso=0.2599, f_geo=0.0294, f_vol=0.1197);
  var nir = _correct_band(image, 'nir', kvol, kvol0, f_iso=0.3093, f_geo=0.0330, f_vol=0.1535);
  var re4 = _correct_band(image, 're4', kvol, kvol0, f_iso=0.2907, f_geo=0.0410, f_vol=0.1611);
  var swir1 = _correct_band(image, 'swir1', kvol, kvol0, f_iso=0.3430, f_geo=0.0453, f_vol=0.1154);   
  var swir2 = _correct_band(image, 'swir2', kvol, kvol0, f_iso=0.2658, f_geo=0.0387, f_vol=0.0639);
	return image.select([]).addBands([blue, green, red, nir,re1,re2,re3,nir,re4,swir1, swir2]);
}

function _apply_landsat(image, kvol, kvol0){
  var f_iso = 0;
  var f_geo = 0;
  var f_vol = 0;
	var blue = _correct_band(image, 'blue', kvol, kvol0, f_iso=0.0774, f_geo=0.0079, f_vol=0.0372);
	var green = _correct_band(image, 'green', kvol, kvol0, f_iso=0.1306, f_geo=0.0178, f_vol=0.0580);
	var red = _correct_band(image, 'red', kvol, kvol0, f_iso=0.1690, f_geo=0.0227, f_vol=0.0574);
  var nir = _correct_band(image, 'nir', kvol, kvol0, f_iso=0.3093, f_geo=0.0330, f_vol=0.1535);
  var swir1 = _correct_band(image, 'swir1', kvol, kvol0, f_iso=0.3430, f_geo=0.0453, f_vol=0.1154);   
  var swir2 = _correct_band(image, 'swir2', kvol, kvol0, f_iso=0.2658, f_geo=0.0387, f_vol=0.0639);
	return image.select([]).addBands([blue, green, red, nir, swir1, swir2]);
}

function _correct_band(image, band_name, kvol, kvol0, f_iso, f_geo, f_vol){
	//"""fiso + fvol * kvol + fgeo * kgeo"""
	var iso = ee.Image(f_iso);
	var geo = ee.Image(f_geo);
	var vol = ee.Image(f_vol);
	var pred = vol.multiply(kvol).add(geo.multiply(kvol)).add(iso).rename(['pred']);
	var pred0 = vol.multiply(kvol0).add(geo.multiply(kvol0)).add(iso).rename(['pred0']);
	var cfac = pred0.divide(pred).rename(['cfac']);
	var corr = image.select(band_name).multiply(cfac).rename([band_name]);
	return corr;
}

function _kvol(sunAz, sunZen, viewAz, viewZen){
	//"""Calculate kvol kernel.
	//From Lucht et al. 2000
	//Phase angle = cos(solar zenith) cos(view zenith) + sin(solar zenith) sin(view zenith) cos(relative azimuth)"""
			
	var relative_azimuth = sunAz.subtract(viewAz).rename(['relAz']);
	var pa1 = viewZen.cos().multiply(sunZen.cos());
	var pa2 = viewZen.sin().multiply(sunZen.sin()).multiply(relative_azimuth.cos());
	var phase_angle1 = pa1.add(pa2);
	var phase_angle = phase_angle1.acos();
	var p1 = ee.Image(PI.divide(2)).subtract(phase_angle);
	var p2 = p1.multiply(phase_angle1);
	var p3 = p2.add(phase_angle.sin());
	var p4 = sunZen.cos().add(viewZen.cos());
	var p5 = ee.Image(PI.divide(4));

	var kvol = p3.divide(p4).subtract(p5).rename(['kvol']);

	var viewZen0 = ee.Image(0);
	var pa10 = viewZen0.cos().multiply(sunZen.cos());
	var pa20 = viewZen0.sin().multiply(sunZen.sin()).multiply(relative_azimuth.cos());
	var phase_angle10 = pa10.add(pa20);
	var phase_angle0 = phase_angle10.acos();
	var p10 = ee.Image(PI.divide(2)).subtract(phase_angle0);
	var p20 = p10.multiply(phase_angle10);
	var p30 = p20.add(phase_angle0.sin());
	var p40 = sunZen.cos().add(viewZen0.cos());
	var p50 = ee.Image(PI.divide(4));

	var kvol0 = p30.divide(p40).subtract(p50).rename(['kvol0']);

	return [kvol, kvol0];
}


function line_from_coords(coordinates, fromIndex, toIndex){
  return ee.Geometry.LineString(ee.List([
    coordinates.get(fromIndex),
    coordinates.get(toIndex)]));
}

function where(condition, trueValue, falseValue){
  var trueMasked = trueValue.mask(condition);
  var falseMasked = falseValue.mask(invert_mask(condition));
      return trueMasked.unmask(falseMasked);
}

function invert_mask(mask){
  return mask.multiply(-1).add(1);
}

function value(list,index){
  return ee.Number(list.get(index));
}


/////Topographic correction////
//Source: https://doi.org/10.3390/rs11070831
function illumination_condition_landsat(img){

  // Extract image metadata about solar position
  var SZ_rad = ee.Image.constant(ee.Number(img.get('SOLAR_ZENITH_ANGLE'))).multiply(3.14159265359).divide(180).clip(img.geometry().buffer(10000)); 
  var SA_rad = ee.Image.constant(ee.Number(img.get('SOLAR_AZIMUTH_ANGLE')).multiply(3.14159265359).divide(180)).clip(img.geometry().buffer(10000)); 
  // Creat terrain layers
  var slp = ee.Terrain.slope(dem).clip(img.geometry().buffer(10000));
  var slp_rad = ee.Terrain.slope(dem).multiply(3.14159265359).divide(180).clip(img.geometry().buffer(10000));
  var asp_rad = ee.Terrain.aspect(dem).multiply(3.14159265359).divide(180).clip(img.geometry().buffer(10000));
  
  // Calculate the Illumination Condition (IC)
  // slope part of the illumination condition
  var cosZ = SZ_rad.cos();
  var cosS = slp_rad.cos();
  var slope_illumination = cosS.expression("cosZ * cosS", 
                                          {'cosZ': cosZ,
                                           'cosS': cosS.select('slope')});
  // aspect part of the illumination condition
  var sinZ = SZ_rad.sin(); 
  var sinS = slp_rad.sin();
  var cosAziDiff = (SA_rad.subtract(asp_rad)).cos();
  var aspect_illumination = sinZ.expression("sinZ * sinS * cosAziDiff", 
                                           {'sinZ': sinZ,
                                            'sinS': sinS,
                                            'cosAziDiff': cosAziDiff});
  // full illumination condition (IC)
  var ic = slope_illumination.add(aspect_illumination);

  // Add IC to original image
  var img_plus_ic = ee.Image(img.addBands(ic.rename('IC')).addBands(cosZ.rename('cosZ')).addBands(cosS.rename('cosS')).addBands(slp.rename('slope')));
  return img_plus_ic;
}
  
function illumination_correction(img){
  var props = img.toDictionary();
  var st = img.get('system:time_start');
  
  var img_plus_ic = img;
  var mask1 = img_plus_ic.select('nir').gt(-0.1);
  var mask2 = img_plus_ic.select('slope').gte(5)
                          .and(img_plus_ic.select('IC').gte(0))
                          .and(img_plus_ic.select('nir').gt(-0.1));
  var img_plus_ic_mask2 = ee.Image(img_plus_ic.updateMask(mask2));
  
  // Specify Bands to topographically correct  
  var bandList = ['blue','green','red','nir','swir1','swir2']; 
  var compositeBands = img.bandNames();
  var nonCorrectBands = img.select(compositeBands.removeAll(bandList));
  
  var geom = ee.Geometry(img.get('system:footprint')).bounds().buffer(10000);
  
  function apply_SCSccorr(band){
    var method = 'SCSc';
    var out = img_plus_ic_mask2.select('IC', band).reduceRegion({
    reducer: ee.Reducer.linearFit(), // Compute coefficients: a(slope), b(offset), c(b/a)
    geometry: ee.Geometry(img.geometry().buffer(-100)), // trim off the outer edges of the image for linear relationship 
    scale: 30,
    maxPixels: 1000000000
    });  
   if (out === null || out === undefined ){
     return img_plus_ic_mask2.select(band);
   } else {
    var out_a = ee.Number(out.get('scale'));
    var out_b = ee.Number(out.get('offset'));
    var out_c = out_b.divide(out_a);
    // Apply the SCSc correction
    var SCSc_output = img_plus_ic_mask2.expression(
      "((image * (cosB * cosZ + cvalue)) / (ic + cvalue))", {
      'image': img_plus_ic_mask2.select(band),
      'ic': img_plus_ic_mask2.select('IC'),
      'cosB': img_plus_ic_mask2.select('cosS'),
      'cosZ': img_plus_ic_mask2.select('cosZ'),
      'cvalue': out_c
    });
    
    return SCSc_output;
     
   }
      
  }
    
  var img_SCSccorr = ee.Image(bandList.map(apply_SCSccorr)).addBands(img_plus_ic.select('IC'));
  var bandList_IC = ee.List([bandList, 'IC']).flatten();
  img_SCSccorr = img_SCSccorr.unmask(img_plus_ic.select(bandList_IC)).select(bandList);
    
  return img_SCSccorr.addBands(nonCorrectBands)
    .setMulti(props)
    .set('system:time_start',st);
}
  
function illumination_condition_sentinel(img){

  // Extract image metadata about solar position
  var SZ_rad = ee.Image.constant(ee.Number(img.get('MEAN_SOLAR_ZENITH_ANGLE'))).multiply(3.14159265359).divide(180).clip(img.geometry().buffer(10000)); 
  var SA_rad = ee.Image.constant(ee.Number(img.get('MEAN_SOLAR_AZIMUTH_ANGLE')).multiply(3.14159265359).divide(180)).clip(img.geometry().buffer(10000)); 
  // Creat terrain layers
  var slp = ee.Terrain.slope(dem).clip(img.geometry().buffer(10000));
  var slp_rad = ee.Terrain.slope(dem).multiply(3.14159265359).divide(180).clip(img.geometry().buffer(10000));
  var asp_rad = ee.Terrain.aspect(dem).multiply(3.14159265359).divide(180).clip(img.geometry().buffer(10000));
  
  // Calculate the Illumination Condition (IC)
  // slope part of the illumination condition
  var cosZ = SZ_rad.cos();
  var cosS = slp_rad.cos();
  var slope_illumination = cosS.expression("cosZ * cosS", 
                                          {'cosZ': cosZ,
                                           'cosS': cosS.select('slope')});
  // aspect part of the illumination condition
  var sinZ = SZ_rad.sin(); 
  var sinS = slp_rad.sin();
  var cosAziDiff = (SA_rad.subtract(asp_rad)).cos();
  var aspect_illumination = sinZ.expression("sinZ * sinS * cosAziDiff", 
                                           {'sinZ': sinZ,
                                            'sinS': sinS,
                                            'cosAziDiff': cosAziDiff});
  // full illumination condition (IC)
  var ic = slope_illumination.add(aspect_illumination);

  // Add IC to original image
  var img_plus_ic = ee.Image(img.addBands(ic.rename('IC')).addBands(cosZ.rename('cosZ')).addBands(cosS.rename('cosS')).addBands(slp.rename('slope')));
  return img_plus_ic;
}

exports.apply_brdf_landsat = apply_brdf_landsat;
exports.apply_brdf_sentinel = apply_brdf_sentinel;
exports.illumination_condition_landsat = illumination_condition_landsat;
exports.illumination_condition_sentinel = illumination_condition_sentinel;
exports.illumination_correction = illumination_correction;
