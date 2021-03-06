'use strict';

var fs = require('fs'),
    path = require('path'),
    File = require('vinyl'),
    vfs = require('vinyl-fs'),
    _ = require('lodash'),
    concat = require('concat-stream'),
    GithubSlugger = require('github-slugger'),
    createFormatters = require('documentation').util.createFormatters,
    LinkerStack = require('documentation').util.LinkerStack,
    hljs = require('highlight.js');

function isFunction(section) {
  return section.kind === 'function' || section.kind === 'typedef' && section.type.type === 'NameExpression' && section.type.name === 'Function';
}
module.exports = function (comments, config) {
  var linkerStack = new LinkerStack(config).namespaceResolver(comments, function (namespace) {
    var slugger = new GithubSlugger();
    return '#' + slugger.slug(namespace, true);
  });

  var formatters = createFormatters(linkerStack.link);

  hljs.configure(config.hljs || {});

  var sharedImports = {
    imports: {
      fs: fs,
      path: path,
      slug: function slug(str) {
        var slugger = new GithubSlugger();
        return slugger.slug(str, true);
      },
      shortSignature: function shortSignature(section) {
        var prefix = '';
        if (section.kind === 'class') {
          prefix = 'new ';
        } else if (!isFunction(section)) {
          return section.name;
        }
        return prefix + section.name + formatters.parameters(section, true);
      },
      signature: function signature(section) {
        var returns = '';
        var prefix = '';
        if (section.kind === 'class') {
          prefix = 'new ';
        } else if (!isFunction(section)) {
          return section.name;
        }
        if (section.returns.length) {
          returns = ': ' + formatters.type(section.returns[0].type);
        }
        return prefix + section.name + formatters.parameters(section)
        // return prefix + section.name + formatters.parameters(section) + returns;
      },
      md: function md(ast, inline) {
        if (inline && ast && ast.children.length && ast.children[0].type === 'paragraph') {
          ast = {
            type: 'root',
            children: ast.children[0].children.concat(ast.children.slice(1))
          };
        }
        return formatters.markdown(ast);
      },

      formatType: formatters.type,
      autolink: formatters.autolink,
      highlight: function highlight(example) {
        if (config.hljs && config.hljs.highlightAuto) {
          return hljs.highlightAuto(example).value;
        }
        return hljs.highlight('js', example).value;
      }
    }
  };

  sharedImports.imports.renderSectionList = _.template(fs.readFileSync(path.join(__dirname, 'section_list._'), 'utf8'), sharedImports);
  sharedImports.imports.renderSection = _.template(fs.readFileSync(path.join(__dirname, 'section._'), 'utf8'), sharedImports);
  sharedImports.imports.renderNote = _.template(fs.readFileSync(path.join(__dirname, 'note._'), 'utf8'), sharedImports);

  var pageTemplate = _.template(fs.readFileSync(path.join(__dirname, 'index._'), 'utf8'), sharedImports);

  // push assets into the pipeline as well.
  return new Promise(function (resolve) {
    vfs.src([__dirname + '/assets/**'], { base: __dirname }).pipe(concat(function (files) {
      resolve(files.concat(new File({
        path: 'index.html',
        contents: new Buffer(pageTemplate({
          docs: comments,
          config: config
        }), 'utf8')
      })));
    }));
  });
};
