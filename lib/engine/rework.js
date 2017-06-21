'use strict';

var path    = require('path'),
    convert = require('convert-source-map'),
    rework  = require('rework'),
    visit   = require('rework-visit');

var absoluteToRelative = require('../sources-absolute-to-relative'),
    valueProcessor     = require('../value-processor');

/**
 * Process the given CSS content into reworked CSS content.
 *
 * @param {string} content CSS content without source-map
 * @param {object} absSourceMap Source-map with absolute source paths
 * @param {{originalPositionFor: function}} sourceMapConsumer An API to retrieve original positions
 * @param {{source: string, sourceMap: boolean, sourceRoot: string} params Options hash
 * @return {{content: string, map: object}} Reworked CSS and optional source-map
 */
function process(content, absSourceMap, sourceMapConsumer, params) {
  var filePath = path.dirname(params.source);
  var transformValue = valueProcessor(filePath, params);

  // embed source-map in css
  var contentWithMap = content + convert.fromObject(absSourceMap).toComment({multiline: true});

  var reworked;
  try {
    reworked = rework(contentWithMap, {source: params.source})
      .use(reworkPlugin)
      .toString({
        sourcemap        : params.sourceMap,
        sourcemapAsObject: params.sourceMap
      });
  }
  catch (exception) {
    return exception;
  }

  // complete with source-map
  //  source-map sources seem to be relative to the file being processed, we need to transform to existing sourceRoot
  if (params.sourceMap) {
    absoluteToRelative(reworked.map.sources, path.resolve(filePath, params.sourceRoot || '.'));
    reworked.map.sourceRoot = params.sourceRoot;
    return {
      content: reworked.code,
      map: reworked.map
    };
  }
  // complete without source-map
  else {
    return {
      content: reworked,
      map : null
    };
  }


  /**
   * Plugin for css rework that follows SASS transpilation.
   *
   * @param {object} stylesheet AST for the CSS output from SASS
   */
  function reworkPlugin(stylesheet) {

    // visit each node (selector) in the stylesheet recursively using the official utility method
    //  each node may have multiple declarations
    visit(stylesheet, function visitor(declarations) {
      if (declarations) {
        declarations.forEach(eachDeclaration);
      }
    });

    /**
     * Process a declaration from the syntax tree.
     * @param declaration
     */
    function eachDeclaration(declaration) {
      var isValid = declaration.value && (declaration.value.indexOf('url') >= 0);
      if (isValid) {

        // reverse the original source-map to find the original sass file
        var startPosApparent = declaration.position.start,
            startPosOriginal = sourceMapConsumer && sourceMapConsumer.originalPositionFor(startPosApparent);

        // we require a valid directory for the specified file
        var directory = startPosOriginal && startPosOriginal.source && path.dirname(startPosOriginal.source);
        if (directory) {
          var newValue = transformValue(declaration.value, directory);
if (declaration.value !== newValue) {
  console.log(declaration.value);
  console.log(newValue);
}
          declaration.value = newValue;
        }
        // source-map present but invalid entry
        else if (sourceMapConsumer) {
          throw new Error('source-map information is not available at url() declaration');
        }
      }
    }
  }
}
module.exports = process;
