[{
    shouldDeps : [
        'inherit',
        'identify',
        'objects',
        'jquery',
        { block : 'i-bem', elem : 'internal' }
    ]
},
{
    tech : 'spec.js',
    shouldDeps : [
        {
            block : 'i-bem',
            tech : 'js'
        },
        {
            block : 'i-bem-dom',
            tech : 'js'
        },
        {
            block : 'events',
            tech : 'js'
        }
    ],
    mustDeps : {
        block : 'i-bem',
        tech : 'bemhtml'
    }
}]
