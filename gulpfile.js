'use strict';

const gulp = require('gulp');
const ts = require('gulp-typescript');
const merge = require('merge2');
const sourcemaps = require('gulp-sourcemaps');
const tsConfig = require('./tsconfig.json');
const tsProject = ts.createProject('./tsconfig.json');

gulp.task('build', function() {
    const result = gulp.src('core/src/**/*.ts')
        .pipe(sourcemaps.init())
        .pipe(tsProject());

    return merge[ 
        result.js.pipe(sourcemaps.write()).pipe(gulp.dest('core/required')),
        result.dts.pipe(gulp.dest('definitions'))
    ];
});

gulp.task('watch', ['build'], function() {
    gulp.watch('core/src/**/*.ts', ['build']);
});