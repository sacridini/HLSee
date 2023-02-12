var csmask = require('users/eduardolacerdageo/default:Embrapa/csmask');
var brdf_topo = require('users/eduardolacerdageo/default:Embrapa/brdf_topo'); 

var roi = ee.Geometry.Point([-43.07224253472556, -22.90853626286694]);
var start_date = '2019-01-01';
var end_date   = '2019-12-31';
var names_band_in_landsat7 = ['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7', 'QA_PIXEL'];
var names_band_out_landsat7 = ['blue','green','red','nir', 'swir1', 'swir2', 'qa_band'];
var names_band_in_landsat8 = ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7', 'QA_PIXEL'];
var names_band_out_landsat8 = ['blue','green','red','nir', 'swir1', 'swir2', 'qa_band'];
var names_band_in_sentinel = ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B11', 'B12', 'QA60'];
var names_band_out_sentinel = ['blue','green','red','re1','re2','re3','nir','re4', 'swir1', 'swir2', 'qa_band'];

// Load and select Landsat 7 Level 2, Collection 2, Tier 1 images
var ls7_c = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
                .filterBounds(roi)
                .filterDate(start_date, end_date)
                .select(names_band_in_landsat7, names_band_out_landsat7)
                .map(function (image) { return csmask.cs_mask_landsat(image, image.select("qa_band")); })
                .map(brdf_topo.apply_brdf_landsat)
                // .map(brdf_topo.illumination_condition_landsat);

// Load and select Landsat 8 Level 2, Collection 2, Tier 1 images
var ls8_c = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
                .filterBounds(roi)
                .filterDate(start_date, end_date)
                .select(names_band_in_landsat8, names_band_out_landsat8)
                .map(function (image) { return csmask.cs_mask_landsat(image, image.select("qa_band")); })
                .map(brdf_topo.apply_brdf_landsat)
                // .map(brdf_topo.illumination_condition_landsat);


// Load and select Sentinel-2 MSI: MultiSpectral Instrument, Level-2A images
var s2_c = ee.ImageCollection('COPERNICUS/S2_SR')
                .filterBounds(roi)
                .filterDate(start_date, end_date)
                .map(csmask.edgesmask_sr_sentinel)
                .select(names_band_in_sentinel, names_band_out_sentinel);

// Load and select Sentinel-2: Cloud Probability images
var s2_cloud_c = ee.ImageCollection('COPERNICUS/S2_CLOUD_PROBABILITY')
                .filterBounds(roi)
                .filterDate(start_date, end_date)


// Join S2 SR with cloud probability dataset to add cloud mask.
var s2_and_s2_cloud_c = ee.Join.saveFirst('cloud_mask').apply({
  primary: s2_c,
  secondary: s2_cloud_c,
  condition:
      ee.Filter.equals({leftField: 'system:index', rightField: 'system:index'})
});

var s2_cloud_masked_c = ee.ImageCollection(s2_and_s2_cloud_c).map(csmask.cloudmask_sr_sentinel);
var s2_cs_masked_c = csmask.simple_TDOM2(s2_cloud_masked_c);
var s2_cs_brdf_c = s2_cs_masked_c.map(brdf_topo.apply_brdf_sentinel);
// var s2_cs_topo_brdf_c = s2_cs_brdf_c.map(brdf_topo.illumination_condition_sentinel);
// var s2_corr_c = s2_cs_topo_brdf_c.map(brdf_topo.illumination_correction);
// var ls8_cs_brdf_c = ls8_c.map(brdf_topo.illumination_condition_landsat)


var s2_list = ee.ImageCollection(s2_cs_brdf_c).toList(999);
var s2_image = ee.Image(ee.List(s2_list).get(0));
Map.centerObject(roi, 10);
var rgbVis = {min: 0, max: 3000, bands: ['red', 'green', 'blue']};
Map.addLayer(s2_image, rgbVis, 'S2 SR masked at 65%', true);