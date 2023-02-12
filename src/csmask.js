var max_cloud_probability = 65;

// Cloud and shadow mask for landsat images
function cs_mask_landsat(original_image, qa_band) {
  
  // Error handling
  if (original_image === undefined) print('cloudmask_sr_landsat: You need to specify an input image.');
  if (qa_band === undefined) print('cloudmask_sr_landsat: You need to specify an input QA band.');
  
    var getQABits = function (qa_band, start, end, newName) {
      var pattern = 0;
      for (var i = start; i <= end; i++) {
        pattern += Math.pow(2, i);
      }
      return qa_band.select([0], [newName])
          .bitwiseAnd(pattern)
          .rightShift(start);
  };
  var cs = getQABits(qa_band, 3, 3, 'Cloud_shadows').eq(0);
  var c = getQABits(qa_band, 5, 5, 'Cloud').eq(0);
  original_image = original_image.updateMask(cs);
  return original_image.updateMask(c);
}

var cloudmask_sr_sentinel_simple = function(original_image, qa_band) {
  
  // Error handling
  if (original_image === undefined) print('cloudmask_sr_sentinel: You need to specify an input image.');
  if (qa_band === undefined) print('cloudmask_sr_sentinel: You need to specify an input QA band.');
  
  var clouds = qa_band.bitwiseAnd(1<<10).or(qa_band.bitwiseAnd(1<<11));// this gives us cloudy pixels
  return original_image.updateMask(clouds.not()); // remove the clouds from image
};


function cloudmask_sr_sentinel(image) {
  var clouds = ee.Image(image.get('cloud_mask')).select('probability');
  var isNotCloud = clouds.lt(max_cloud_probability);
  return image.updateMask(isNotCloud);
}

// The masks for the 10m bands sometimes do not exclude bad data at
// scene edges, so we apply masks from the 20m and 60m bands as well.
// https://developers.google.com/earth-engine/datasets/catalog/COPERNICUS_S2_CLOUD_PROBABILITY
function edgesmask_sr_sentinel(image) {
  return image.updateMask(
      image.select('B8A').mask().updateMask(image.select('B9').mask()));
}

// Function for finding dark outliers in time series
// Masks pixels that are dark, and dark outliers
function simple_TDOM2(image){
  var shadow_sum_bands = ['nir','swir1'];
  var sim_thresh = 0.4;
  var z_shadow_thresh = -1.2;
  //Get some pixel-wise stats for the time series
  var img_std_dev = image.select(shadow_sum_bands).reduce(ee.Reducer.stdDev());
  var img_mean = image.select(shadow_sum_bands).mean();
  var band_names = ee.Image(image.first()).bandNames();
  //Mask out dark dark outliers
  image = image.map(function(img){
    var z = img.select(shadow_sum_bands).subtract(img_mean).divide(img_std_dev);
    var img_sum = img.select(shadow_sum_bands).reduce(ee.Reducer.sum());
    var m = z.lt(z_shadow_thresh).reduce(ee.Reducer.sum()).eq(2).and(img_sum.lt(sim_thresh)).not();
    
    return img.updateMask(img.mask().and(m));
  });
  
  return image.select(band_names);
}

exports.cs_mask_landsat = cs_mask_landsat;
exports.cloudmask_sr_sentinel = cloudmask_sr_sentinel;
exports.edgesmask_sr_sentinel = edgesmask_sr_sentinel;
exports.simple_TDOM2 = simple_TDOM2